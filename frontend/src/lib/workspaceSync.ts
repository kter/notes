/**
 * ワークスペーススナップショットの永続化と同期メタデータ管理を担うモジュール。
 * カーソル・デバイス ID の localStorage 管理、IndexedDB へのスナップショット保存を提供する。
 *
 * 主なエクスポート:
 * - persistWorkspaceSnapshot: 全スナップショットを IndexedDB に保存
 * - persistWorkspaceSnapshotIncremental: 差分のみを IndexedDB に反映
 * - getWorkspaceSyncRequestMetadata: 同期 API リクエスト用メタデータを返す
 * - refreshWorkspaceSnapshot: サーバーから最新スナップショットを再取得して保存
 * - isConflictApiError: 409 競合エラーか判定する
 *
 * 呼び出し関係: syncQueue、useNoteSyncEngine から使用される。
 */
import { notesDB } from "@/lib/indexedDB";
import { ApiError } from "@/lib/api";
import type { Folder, Note, WorkspaceAppliedChange, WorkspaceSnapshotResponse } from "@/types";

const WORKSPACE_CURSOR_STORAGE_KEY = "notes-workspace-cursor";
const WORKSPACE_DEVICE_ID_STORAGE_KEY = "notes-workspace-device-id";

interface SnapshotSyncOptions {
  onSnapshotSynced: (snapshot: WorkspaceSnapshotResponse) => void;
}

/**
 * SSR 環境では window が存在しないため null を返し、クライアント側のみ localStorage を使う。
 */
function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

/**
 * deleted_at が設定されている論理削除済みエンティティかを判定する。
 */
export function isDeletedEntity<T extends { deleted_at: string | null }>(
  entity: T
): boolean {
  return entity.deleted_at !== null;
}

/**
 * ノートの content 先頭 80 文字を snippet として付与して返す。
 */
export function withSnippet(note: Note): Note {
  return { ...note, snippet: note.content.slice(0, 80) };
}

/**
 * スナップショットから論理削除されていないフォルダのみ抽出して返す。
 */
export function getActiveFolders(snapshot: WorkspaceSnapshotResponse): Folder[] {
  return snapshot.folders.filter((folder) => !isDeletedEntity(folder));
}

/**
 * スナップショットから論理削除されていないノートを抽出し、snippet を付与して返す。
 */
export function getActiveNotes(snapshot: WorkspaceSnapshotResponse): Note[] {
  return snapshot.notes.filter((note) => !isDeletedEntity(note)).map(withSnippet);
}

/**
 * 適用済み変更に含まれるエンティティのみを IndexedDB に差分反映する。
 * 全件保存より高速で、ノート編集のたびに呼ばれる増分同期処理に使用する。
 */
export async function persistWorkspaceSnapshotIncremental(
  snapshot: WorkspaceSnapshotResponse,
  appliedChanges: WorkspaceAppliedChange[]
): Promise<void> {
  const appliedNoteIds = new Set(
    appliedChanges.filter((c) => c.entity === "note").map((c) => c.entity_id)
  );
  const appliedFolderIds = new Set(
    appliedChanges.filter((c) => c.entity === "folder").map((c) => c.entity_id)
  );

  const notesById = new Map(snapshot.notes.map((n) => [n.id, n]));
  const foldersById = new Map(snapshot.folders.map((f) => [f.id, f]));

  await Promise.all([
    ...[...appliedNoteIds].map((id) => {
      const note = notesById.get(id);
      if (!note) return Promise.resolve();
      return isDeletedEntity(note)
        ? notesDB.deleteNote(id)
        : notesDB.saveNote(withSnippet(note));
    }),
    ...[...appliedFolderIds].map((id) => {
      const folder = foldersById.get(id);
      if (!folder) return Promise.resolve();
      return isDeletedEntity(folder)
        ? notesDB.deleteFolder(id)
        : notesDB.saveFolder(folder);
    }),
  ]);

  setWorkspaceCursor(snapshot.cursor);
}

/**
 * スナップショット全体を IndexedDB に保存する。
 * アクティブなエンティティを一括保存した後、論理削除済みのものを個別削除する。
 * オフライン復帰後の全量同期や初回ロード時に使用する。
 */
export async function persistWorkspaceSnapshot(
  snapshot: WorkspaceSnapshotResponse
): Promise<void> {
  const activeFolders = getActiveFolders(snapshot);
  const activeNotes = getActiveNotes(snapshot);

  await notesDB.saveFolders(activeFolders);
  await notesDB.saveNotes(activeNotes);

  await Promise.all([
    ...snapshot.folders
      .filter(isDeletedEntity)
      .map((folder) => notesDB.deleteFolder(folder.id)),
    ...snapshot.notes
      .filter(isDeletedEntity)
      .map((note) => notesDB.deleteNote(note.id)),
  ]);

  setWorkspaceCursor(snapshot.cursor);
}

/**
 * localStorage からワークスペースカーソルを取得する。
 * カーソルは増分同期の起点として API に渡す。
 */
export function getWorkspaceCursor(): string | null {
  return getStorage()?.getItem(WORKSPACE_CURSOR_STORAGE_KEY) ?? null;
}

/**
 * ワークスペースカーソルを localStorage に保存する。
 */
export function setWorkspaceCursor(cursor: string): void {
  getStorage()?.setItem(WORKSPACE_CURSOR_STORAGE_KEY, cursor);
}

/**
 * デバイス ID を localStorage から取得、なければ生成して保存して返す。
 * crypto.randomUUID が使えない環境ではタイムスタンプとランダム文字列で代替する。
 */
export function getWorkspaceDeviceId(): string {
  const storage = getStorage();
  const existing = storage?.getItem(WORKSPACE_DEVICE_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const deviceId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  storage?.setItem(WORKSPACE_DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

/**
 * 同期 API リクエストに付与するデバイス ID とカーソルをまとめて返す。
 * カーソルが未設定の場合は base_cursor を省略する（初回全量同期扱い）。
 */
export function getWorkspaceSyncRequestMetadata(): {
  device_id: string;
  base_cursor?: string;
} {
  const cursor = getWorkspaceCursor();
  return {
    device_id: getWorkspaceDeviceId(),
    ...(cursor ? { base_cursor: cursor } : {}),
  };
}

/**
 * HTTP 409 競合エラーかどうかを型ガード付きで判定する。
 */
export function isConflictApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}

/**
 * サーバーから最新のワークスペーススナップショットを取得し、IndexedDB に保存して返す。
 * 競合エラー（409）発生時にローカル状態をサーバーの真実で上書きするために使用する。
 */
export async function refreshWorkspaceSnapshot(apiClient: {
  getWorkspaceSnapshot: () => Promise<WorkspaceSnapshotResponse>;
}, options: SnapshotSyncOptions): Promise<WorkspaceSnapshotResponse> {
  const snapshot = await apiClient.getWorkspaceSnapshot();
  await persistWorkspaceSnapshot(snapshot);
  options.onSnapshotSynced(snapshot);
  return snapshot;
}
