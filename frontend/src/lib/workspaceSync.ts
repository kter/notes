import { notesDB } from "@/lib/indexedDB";
import type { Folder, Note, WorkspaceSnapshotResponse } from "@/types";

export const WORKSPACE_SYNCED_EVENT = "workspace:synced";

export interface WorkspaceSyncedEventDetail {
  snapshot: WorkspaceSnapshotResponse;
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
