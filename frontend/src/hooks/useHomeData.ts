import { useWorkspaceSnapshotState } from "@/hooks/workspace/useWorkspaceSnapshotState";

export function useHomeData(isAuthenticated: boolean) {
  return useWorkspaceSnapshotState(isAuthenticated);
}
