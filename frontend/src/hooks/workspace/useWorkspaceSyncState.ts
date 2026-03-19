"use client";

import { useOfflineSync } from "@/hooks/useOfflineSync";

import { useWorkspaceSnapshotState } from "./useWorkspaceSnapshotState";

export function useWorkspaceSyncState(isAuthenticated: boolean) {
  const snapshotState = useWorkspaceSnapshotState(isAuthenticated);
  const offlineSyncState = useOfflineSync({
    onSnapshotSynced: snapshotState.applySnapshot,
  });

  return {
    ...snapshotState,
    ...offlineSyncState,
  };
}
