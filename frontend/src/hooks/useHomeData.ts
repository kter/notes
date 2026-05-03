/**
 * ホーム画面に必要なワークスペーススナップショットデータを提供するファサードフック。
 * useWorkspaceSnapshotState の薄いラッパーとして機能する。
 *
 * 主なエクスポート:
 * - useHomeData: folders / notes / isLoading / applySnapshot を返す
 *
 * 呼び出し関係: app/(home) などのホームページコンポーネントから使われる。
 */
import { useWorkspaceSnapshotState } from "@/hooks/workspace/useWorkspaceSnapshotState";

export function useHomeData(isAuthenticated: boolean) {
  return useWorkspaceSnapshotState(isAuthenticated);
}
