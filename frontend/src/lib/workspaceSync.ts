import { notesDB } from "@/lib/indexedDB";
import type { Folder, Note, WorkspaceSnapshotResponse } from "@/types";

export const WORKSPACE_SYNCED_EVENT = "workspace:synced";
const WORKSPACE_CURSOR_STORAGE_KEY = "notes-workspace-cursor";
const WORKSPACE_DEVICE_ID_STORAGE_KEY = "notes-workspace-device-id";

export interface WorkspaceSyncedEventDetail {
  snapshot: WorkspaceSnapshotResponse;
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

export function getActiveFolders(snapshot: WorkspaceSnapshotResponse): Folder[] {
  return snapshot.folders.filter((folder) => !isDeletedEntity(folder));
}

export function getActiveNotes(snapshot: WorkspaceSnapshotResponse): Note[] {
  return snapshot.notes.filter((note) => !isDeletedEntity(note));
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

export function dispatchWorkspaceSynced(
  detail: WorkspaceSyncedEventDetail
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<WorkspaceSyncedEventDetail>(WORKSPACE_SYNCED_EVENT, {
      detail,
    })
  );
}
