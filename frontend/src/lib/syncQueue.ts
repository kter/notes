/**
 * オフライン対応の同期キューマネージャー。
 * ネットワーク不在時の変更を IndexedDB に蓄積し、オンライン復帰後にサーバーへ一括送信する。
 *
 * 主なエクスポート:
 * - syncQueue: SyncQueueManager のシングルトンインスタンス
 * - SyncStatus: 同期状態の型
 *
 * 呼び出し関係: useNoteSyncEngine から変更追加・キュー処理のために使用される。
 */

import { notesDB, type PendingChange, type SyncOperationType } from "./indexedDB";
import { ApiError } from "./api";
import {
  getWorkspaceSyncRequestMetadata,
  persistWorkspaceSnapshot,
  isConflictApiError,
  refreshWorkspaceSnapshot,
} from "./workspaceSync";
import type {
  Folder,
  Note,
  WorkspaceChangeRequest,
  WorkspaceChangesResponse,
} from "@/types";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

const NOOP_SNAPSHOT_SYNC: (snapshot: WorkspaceChangesResponse["snapshot"]) => void = () => {};

interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: Error[];
  snapshot?: WorkspaceChangesResponse["snapshot"];
  errorCode?: "conflict";
}

interface ProcessQueueOptions {
  onSnapshotSynced?: (snapshot: WorkspaceChangesResponse["snapshot"]) => void;
}

type ApiClient = {
  applyWorkspaceChanges: (request: {
    device_id?: string;
    base_cursor?: string;
    changes: WorkspaceChangeRequest[];
  }) => Promise<WorkspaceChangesResponse>;
  getWorkspaceSnapshot: () => Promise<WorkspaceChangesResponse["snapshot"]>;
};

/**
 * 未同期変更キューの管理クラス。
 * 変更の追加・マージ・送信・クリアを担い、二重送信を防ぐ isSyncing フラグを持つ。
 */
class SyncQueueManager {
  private isSyncing = false;

  /**
   * タイムスタンプとランダム文字列を組み合わせた一意な変更 ID を生成する。
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 未同期変更をキューに追加する。
   * 同一エンティティの既存変更がある場合は操作種別に応じてマージ・削除する。
   * 例: create + update → create に統合、create + delete → キャンセル扱いで削除。
   */
  async addChange(
    type: SyncOperationType,
    entityType: "note" | "folder",
    entityId: string,
    data?: Partial<Note> | Partial<Folder>,
    options: { expectedVersion?: number } = {}
  ): Promise<void> {
    const change: PendingChange = {
      id: this.generateId(),
      type,
      entityType,
      entityId,
      data,
      expectedVersion: options.expectedVersion,
      timestamp: Date.now(),
    };

    const existingChanges = await notesDB.getPendingChanges();
    const existingIndex = existingChanges.findIndex(
      (candidate) =>
        candidate.entityType === entityType && candidate.entityId === entityId
    );

    if (existingIndex !== -1) {
      const existing = existingChanges[existingIndex];

      if (existing.type === "create" && type === "update") {
        // create 中に update が来た場合、create に内容をマージして一つにまとめる
        await notesDB.removePendingChange(existing.id);
        change.type = "create";
        change.data = { ...existing.data, ...data };
      } else if (existing.type === "create" && type === "delete") {
        // 未送信の create を削除する場合はキャンセル扱いで両方を除去する
        await notesDB.removePendingChange(existing.id);
        return;
      } else if (existing.type === "update" && type === "update") {
        // 複数の update を一つに集約し、expectedVersion は最初の変更時点のものを保持する
        await notesDB.removePendingChange(existing.id);
        change.data = { ...existing.data, ...data };
        change.expectedVersion = existing.expectedVersion;
      } else if (existing.type === "update" && type === "delete") {
        // update 後に delete が来た場合、expectedVersion は update 時点のものを引き継ぐ
        await notesDB.removePendingChange(existing.id);
        change.expectedVersion = existing.expectedVersion;
      }
    }

    await notesDB.addPendingChange(change);
  }

  /** キュー内の全未同期変更を返す。 */
  async getPendingChanges(): Promise<PendingChange[]> {
    return notesDB.getPendingChanges();
  }

  /** キュー内の未同期変更件数を返す。 */
  async getPendingCount(): Promise<number> {
    const changes = await notesDB.getPendingChanges();
    return changes.length;
  }

  /**
   * キューに溜まった全変更をサーバーへ一括送信する。
   * 409 競合エラー時はスナップショットを再取得してキューをクリアする。
   * 4xx 永続エラー時はリトライ不要と判断してキューを破棄する。
   * 二重処理を防ぐため isSyncing フラグで排他制御する。
   */
  async processQueue(
    apiClient: ApiClient,
    options: ProcessQueueOptions = {}
  ): Promise<SyncResult> {
    // 既に処理中なら空の失敗結果を返して早期リターンする
    if (this.isSyncing) {
      return { success: false, syncedCount: 0, failedCount: 0, errors: [] };
    }

    this.isSyncing = true;
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    };

    try {
      const changes = await notesDB.getPendingChanges();
      if (changes.length === 0) {
        return result;
      }

      try {
        const response = await apiClient.applyWorkspaceChanges({
          ...getWorkspaceSyncRequestMetadata(),
          changes: changes.map((change) => this.toWorkspaceChangeRequest(change)),
        });

        await this.persistSuccessfulSync(changes, response, options);
        result.syncedCount = changes.length;
        result.snapshot = response.snapshot;
      } catch (error) {
        if (isConflictApiError(error)) {
          const snapshot = await refreshWorkspaceSnapshot(apiClient, {
            onSnapshotSynced: options.onSnapshotSynced ?? NOOP_SNAPSHOT_SYNC,
          });
          for (const change of changes) {
            await notesDB.removePendingChange(change.id);
          }
          result.snapshot = snapshot;
          result.errorCode = "conflict";
          result.success = false;
        } else if (this.isPermanentError(error)) {
          for (const change of changes) {
            await notesDB.removePendingChange(change.id);
          }
        } else {
          result.failedCount = changes.length;
          result.errors.push(error instanceof Error ? error : new Error(String(error)));
          result.success = false;
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /** 同期キューを全件クリアする。 */
  async clearQueue(): Promise<void> {
    await notesDB.clearPendingChanges();
  }

  /** 現在同期処理中かどうかを返す。 */
  get syncing(): boolean {
    return this.isSyncing;
  }

  /**
   * PendingChange を API リクエスト形式の WorkspaceChangeRequest に変換する。
   * create 操作時は entity_id を送らず、delete 操作時は payload を送らない。
   */
  private toWorkspaceChangeRequest(change: PendingChange): WorkspaceChangeRequest {
    return {
      entity: change.entityType,
      operation: change.type,
      entity_id: change.type === "create" ? undefined : change.entityId,
      client_mutation_id: change.id,
      expected_version: change.expectedVersion,
      payload: change.type === "delete" ? undefined : change.data,
    };
  }

  /**
   * サーバー送信成功後にローカル状態を確定させる。
   * temp ID のエンティティを削除し、サーバースナップショットを IndexedDB に保存する。
   */
  private async persistSuccessfulSync(
    changes: PendingChange[],
    response: WorkspaceChangesResponse,
    options: ProcessQueueOptions
  ): Promise<void> {
    for (const change of changes) {
      if (change.type === "create" && change.entityId.startsWith("temp-")) {
        if (change.entityType === "note") {
          await notesDB.deleteNote(change.entityId);
        } else {
          await notesDB.deleteFolder(change.entityId);
        }
      }
    }

    await persistWorkspaceSnapshot(response.snapshot);
    options.onSnapshotSynced?.(response.snapshot);

    for (const change of changes) {
      await notesDB.removePendingChange(change.id);
    }
  }

  /**
   * リトライ不要な永続的エラーかを判定する。
   * 4xx のうち認証・権限・タイムアウト・競合・レート制限を除いたものを永続エラーとみなす。
   */
  private isPermanentError(error: unknown): boolean {
    if (!(error instanceof ApiError)) {
      return false;
    }

    const status = error.status;
    // 401/403/408/409/429 はリトライ対象のため除外する
    return status >= 400 && status < 500 && ![401, 403, 408, 409, 429].includes(status);
  }
}

export const syncQueue = new SyncQueueManager();
