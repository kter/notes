export type LocalSyncStatus = "saved" | "failed" | "unsaved";
export type RemoteSyncStatus = "synced" | "syncing" | "failed" | "unsynced";

export interface SyncStatus {
  local: LocalSyncStatus;
  remote: RemoteSyncStatus;
  lastError?: string;
  isSaving: boolean;
}
