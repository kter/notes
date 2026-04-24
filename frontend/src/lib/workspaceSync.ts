import { notesDB } from "@/lib/indexedDB";
import { ApiError } from "@/lib/api";
import type { Folder, Note, WorkspaceAppliedChange, WorkspaceSnapshotResponse } from "@/types";

const WORKSPACE_CURSOR_STORAGE_KEY = "notes-workspace-cursor";
const WORKSPACE_DEVICE_ID_STORAGE_KEY = "notes-workspace-device-id";

interface SnapshotSyncOptions {
  onSnapshotSynced: (snapshot: WorkspaceSnapshotResponse) => void;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function isDeletedEntity<T extends { deleted_at: string | null }>(
  entity: T
): boolean {
  return entity.deleted_at !== null;
}

export function withSnippet(note: Note): Note {
  return { ...note, snippet: note.content.slice(0, 80) };
}

export function getActiveFolders(snapshot: WorkspaceSnapshotResponse): Folder[] {
  return snapshot.folders.filter((folder) => !isDeletedEntity(folder));
}

export function getActiveNotes(snapshot: WorkspaceSnapshotResponse): Note[] {
  return snapshot.notes.filter((note) => !isDeletedEntity(note)).map(withSnippet);
}

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

export function getWorkspaceCursor(): string | null {
  return getStorage()?.getItem(WORKSPACE_CURSOR_STORAGE_KEY) ?? null;
}

export function setWorkspaceCursor(cursor: string): void {
  getStorage()?.setItem(WORKSPACE_CURSOR_STORAGE_KEY, cursor);
}

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

export function isConflictApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}

export async function refreshWorkspaceSnapshot(apiClient: {
  getWorkspaceSnapshot: () => Promise<WorkspaceSnapshotResponse>;
}, options: SnapshotSyncOptions): Promise<WorkspaceSnapshotResponse> {
  const snapshot = await apiClient.getWorkspaceSnapshot();
  await persistWorkspaceSnapshot(snapshot);
  options.onSnapshotSynced(snapshot);
  return snapshot;
}
