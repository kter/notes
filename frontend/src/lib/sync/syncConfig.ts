/**
 * サーバー同期失敗時の指数バックオフリトライ設定。
 *
 * リトライ間隔は retryBaseDelayMs * 2^attempt で計算し、
 * retryMaxDelayMs を上限として頭打ちにする。
 * 一時的なエラー（ネットワーク障害など）は maxRetryAttempts 回まで再試行する。
 * 401 認証エラーはセッション失効を意味するため即時非リトライ（バナー表示）。
 * 409 競合エラーのみリトライ対象外（スナップショット再取得で解決）。
 * オフライン時は syncQueue に積み、再接続時にフラッシュする。
 */
export const SYNC_RETRY_CONFIG = {
  /** リトライ間隔の基準値 (ms)。指数バックオフの底として使用 */
  retryBaseDelayMs: 2000,
  /** リトライ間隔の上限 (ms)。バックオフが際限なく伸びないよう制限（例: 2s→4s→8s→16s→30s→30s…） */
  retryMaxDelayMs: 30000,
  /** 最大リトライ試行回数。超過した場合はリトライを打ち切り failed で終端する */
  maxRetryAttempts: 10,
} as const;
