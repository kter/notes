/**
 * 同期エンジン全体で使用するステータス型の定義。
 * ローカル保存とサーバー同期を独立したステートとして管理し、
 * UI がそれぞれの状態を個別に表示できるようにする。
 */

/**
 * IndexedDB へのローカル保存状態。
 * - "saved"  : 最新の変更が IndexedDB に永続化済み
 * - "failed" : IndexedDB への書き込みに失敗
 * - "unsaved": 未保存の変更がある (現在は主に初期値として使用)
 */
export type LocalSyncStatus = "saved" | "failed" | "unsaved";

/**
 * サーバーへの同期状態。
 * - "synced"  : サーバーと一致している
 * - "syncing" : サーバーへのリクエスト中
 * - "failed"  : サーバー同期に失敗 (オフライン・競合・エラーを含む)
 * - "unsynced": ローカルに変更はあるがまだサーバーへ送っていない (デバウンス待ち)
 */
export type RemoteSyncStatus = "synced" | "syncing" | "failed" | "unsynced";

/**
 * UI に公開する統合同期ステータス。
 * useNoteSyncEngine が返す syncStatus オブジェクトの型。
 */
export interface SyncStatus {
  local: LocalSyncStatus;
  remote: RemoteSyncStatus;
  /** 直近のエラーメッセージ。正常時は undefined */
  lastError?: string;
  /** サーバーへのリクエストが進行中かどうか (remote === "syncing" の糖衣) */
  isSaving: boolean;
  retryCountdown?: number; // seconds until next retry; undefined = not retrying
}
