"use client";

/**
 * フォルダの作成・リネーム・削除操作を提供するフック。
 * オンライン時はサーバーへ即時反映し、オフライン時は syncQueue にキューイングする。
 * 操作結果として返るスナップショットは onSnapshotSynced コールバックで上位に通知される。
 *
 * 主なエクスポート:
 * - useFolders: handleCreateFolder / handleRenameFolder / handleDeleteFolder を返すフック
 *
 * 呼び出し関係: useWorkspaceState から使用される。
 */

import { useCallback } from "react";

import { useApi } from "./useApi";
import { notesDB } from "@/lib/indexedDB";
import { logger } from "@/lib/logger";
import { syncQueue } from "@/lib/syncQueue";
import {
  getWorkspaceSyncRequestMetadata,
  isConflictApiError,
  persistWorkspaceSnapshot,
  refreshWorkspaceSnapshot,
} from "@/lib/workspaceSync";
import type { Folder } from "@/types";

interface UseFoldersReturn {
  folders: Folder[];
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  handleCreateFolder: (name: string) => Promise<void>;
  handleRenameFolder: (id: string, name: string) => Promise<void>;
  handleDeleteFolder: (id: string) => Promise<void>;
}

interface UseFoldersOptions {
  onSnapshotSynced: (snapshot: {
    folders: Folder[];
    notes: import("@/types").Note[];
    cursor: string;
    server_time: string;
  }) => void;
}

/**
 * folders / setFolders を受け取り、フォルダ操作ハンドラーを返す。
 * オフライン時の変更は IndexedDB と syncQueue に保存され、復帰後に自動送信される。
 * コンフリクトエラー発生時はサーバースナップショットを再取得してリカバリする。
 */
export function useFolders(
  folders: Folder[],
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>,
  selectedFolderId: string | null,
  setSelectedFolderId: (id: string | null) => void,
  options: UseFoldersOptions
): UseFoldersReturn {
  const { getApi } = useApi();
  const onSnapshotSynced = options.onSnapshotSynced;

  const handleCreateFolder = useCallback(
    async (name: string) => {
      const tempId = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      const now = new Date().toISOString();
      const tempFolder: Folder = {
        id: tempId,
        name,
        user_id: "",
        version: 1,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };

      // 楽観的更新: UIに即時反映してからサーバーへ送信する
      setFolders((prev) => [tempFolder, ...prev]);

      try {
        await notesDB.saveFolder(tempFolder);
      } catch (error) {
        logger.error("Failed to save folder locally", error);
      }

      if (navigator.onLine) {
        try {
          const apiClient = await getApi();
          const response = await apiClient.applyWorkspaceChanges({
            ...getWorkspaceSyncRequestMetadata(),
            changes: [
              {
                entity: "folder",
                operation: "create",
                payload: { name },
              },
            ],
          });

          // サーバー確定後、仮IDレコードを削除してスナップショットで置き換える
          await notesDB.deleteFolder(tempId);
          await persistWorkspaceSnapshot(response.snapshot);
          onSnapshotSynced(response.snapshot);
          return;
        } catch (error) {
          if (isConflictApiError(error)) {
            // バージョン競合: 最新サーバー状態を再取得して整合性を回復する
            const apiClient = await getApi();
            await refreshWorkspaceSnapshot(apiClient, { onSnapshotSynced });
            return;
          }
          logger.error("Failed to create folder", error);
        }
      }

      // オフライン時は syncQueue に積んで復帰後に送信する
      await syncQueue.addChange("create", "folder", tempId, { name });
    },
    [getApi, onSnapshotSynced, setFolders]
  );

  const handleRenameFolder = useCallback(
    async (id: string, name: string) => {
      const existingFolder = folders.find((folder) => folder.id === id);
      if (!existingFolder) {
        return;
      }

      const updatedFolder: Folder = {
        ...existingFolder,
        name,
        version: existingFolder.version + 1,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      };

      setFolders((prev) => prev.map((folder) => (folder.id === id ? updatedFolder : folder)));

      try {
        await notesDB.saveFolder(updatedFolder);
      } catch (error) {
        logger.error("Failed to save folder locally", error);
      }

      if (navigator.onLine) {
        try {
          const apiClient = await getApi();
          const response = await apiClient.applyWorkspaceChanges({
            ...getWorkspaceSyncRequestMetadata(),
            changes: [
              {
                entity: "folder",
                operation: "update",
                entity_id: id,
                expected_version: existingFolder.version,
                payload: { name },
              },
            ],
          });

          await persistWorkspaceSnapshot(response.snapshot);
          onSnapshotSynced(response.snapshot);
          return;
        } catch (error) {
          if (isConflictApiError(error)) {
            const apiClient = await getApi();
            await refreshWorkspaceSnapshot(apiClient, { onSnapshotSynced });
            return;
          }
          logger.error("Failed to rename folder", error);
        }
      }

      await syncQueue.addChange("update", "folder", id, { name }, {
        expectedVersion: existingFolder.version,
      });
    },
    [folders, getApi, onSnapshotSynced, setFolders]
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      const existingFolder = folders.find((folder) => folder.id === id);
      if (!existingFolder) {
        return;
      }

      setFolders((prev) => prev.filter((folder) => folder.id !== id));
      if (selectedFolderId === id) {
        setSelectedFolderId(null);
      }

      try {
        await notesDB.deleteFolder(id);
      } catch (error) {
        logger.error("Failed to delete folder locally", error);
      }

      if (id.startsWith("temp-")) {
        return;
      }

      if (navigator.onLine) {
        try {
          const apiClient = await getApi();
          const response = await apiClient.applyWorkspaceChanges({
            ...getWorkspaceSyncRequestMetadata(),
            changes: [
              {
                entity: "folder",
                operation: "delete",
                entity_id: id,
                expected_version: existingFolder.version,
              },
            ],
          });

          await persistWorkspaceSnapshot(response.snapshot);
          onSnapshotSynced(response.snapshot);
          return;
        } catch (error) {
          if (isConflictApiError(error)) {
            const apiClient = await getApi();
            await refreshWorkspaceSnapshot(apiClient, { onSnapshotSynced });
            return;
          }
          logger.error("Failed to delete folder", error);
        }
      }

      await syncQueue.addChange("delete", "folder", id, undefined, {
        expectedVersion: existingFolder.version,
      });
    },
    [folders, getApi, onSnapshotSynced, selectedFolderId, setFolders, setSelectedFolderId]
  );

  return {
    folders,
    setFolders,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
  };
}
