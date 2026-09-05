"use client";

/**
 * ワークスペースの初期データ読み込みとスナップショット管理を担うフック。
 * マウント時に IndexedDB からローカルキャッシュを即時表示し、続いてサーバースナップショットを取得してマージする。
 * applySnapshot はオフライン同期完了後にも呼ばれ、最新状態をステートへ反映する。
 *
 * 主なエクスポート:
 * - useWorkspaceSnapshotState: folders / setFolders / notes / setNotes /
 *                               isLoading / applySnapshot を返す
 *
 * 呼び出し関係: useWorkspaceState および useHomeData から呼ばれる。
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { notesDB } from "@/lib/indexedDB";
import { logger } from "@/lib/logger";
import {
  mergeFolders,
  mergeNotes,
  reconcileFoldersDelta,
  reconcileNotesDelta,
} from "@/lib/merge";
import {
  getActiveFolders,
  getActiveNotes,
  getWorkspaceCursor,
  isDeletedEntity,
  persistWorkspaceSnapshot,
  withSnippet,
} from "@/lib/workspaceSync";
import { useApi } from "@/hooks/useApi";
import type { Folder, Note, WorkspaceSnapshotResponse } from "@/types";

export function useWorkspaceSnapshotState(isAuthenticated: boolean) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { isLoading: authLoading } = useAuth();
  const { getApi } = useApi();
  const hasFetchedRef = useRef(false);

  const applySnapshot = useCallback((snapshot: WorkspaceSnapshotResponse) => {
    setFolders(getActiveFolders(snapshot));
    setNotes(getActiveNotes(snapshot));
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadData() {
      if (!isAuthenticated) {
        if (isActive) {
          setIsLoading(false);
        }
        return;
      }

      if (hasFetchedRef.current) {
        return;
      }
      hasFetchedRef.current = true;

      try {
        const [localFolders, localNotesRaw] = await Promise.all([
          notesDB.getAllFolders(),
          notesDB.getAllNotes(),
        ]);
        const localNotes = localNotesRaw.map(withSnippet);

        if (localFolders.length > 0 || localNotes.length > 0) {
          if (!isActive) {
            return;
          }

          setFolders(localFolders);
          setNotes(localNotes);
          setIsLoading(false);
        }

        if (navigator.onLine) {
          const apiClient = await getApi();
          // ローカルキャッシュとカーソルがある再訪時は差分のみ取得し、初回は全件取得する。
          const cursor = getWorkspaceCursor();
          const useDelta =
            cursor !== null &&
            (localFolders.length > 0 || localNotes.length > 0);
          const snapshot = await apiClient.getWorkspaceSnapshot(
            useDelta ? cursor : undefined
          );
          if (!isActive) {
            return;
          }

          if (useDelta) {
            // 差分: tombstone を含む delta をローカルへ適用（取りこぼし防止）
            const deltaNotes = snapshot.notes.map((note) =>
              isDeletedEntity(note) ? note : withSnippet(note)
            );
            setFolders(reconcileFoldersDelta(localFolders, snapshot.folders));
            setNotes(reconcileNotesDelta(localNotes, deltaNotes));
          } else {
            const serverFolders = getActiveFolders(snapshot);
            const serverNotes = getActiveNotes(snapshot);
            setFolders(mergeFolders(localFolders, serverFolders));
            setNotes(mergeNotes(localNotes, serverNotes));
          }

          await persistWorkspaceSnapshot(snapshot);
        }
      } catch (error) {
        if (isActive) {
          logger.error("Failed to load workspace data", error);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    if (!authLoading) {
      void loadData();
    }

    return () => {
      isActive = false;
      hasFetchedRef.current = false;
    };
  }, [authLoading, getApi, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      hasFetchedRef.current = false;
    }
  }, [isAuthenticated]);

  return { folders, setFolders, notes, setNotes, isLoading, applySnapshot };
}
