"use client";

/**
 * ワークスペースのスナップショット状態とオフライン同期状態を合成するフック。
 * useWorkspaceSnapshotState と useOfflineSync を組み合わせ、
 * オフライン復帰時のスナップショット再適用を橋渡しする。
 *
 * 主なエクスポート:
 * - useWorkspaceSyncState: snapshotState と offlineSyncState をマージした値を返す
 *
 * 呼び出し関係: useWorkspaceState から呼ばれる。
 */
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
