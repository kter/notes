/**
 * サーバー同期失敗時の指数バックオフリトライ設定。
 *
 * リトライ間隔は retryBaseDelayMs * 2^attempt で計算し、
 * retryMaxDelayMs を上限として打ち切る。
 * maxRetryAttempts を超えた場合はリトライを中止し、"failed" 状態のままにする。
 */
export const SYNC_RETRY_CONFIG = {
  /** 最大リトライ回数。これを超えると自動リトライを諦める */
  maxRetryAttempts: 3,
  /** リトライ間隔の基準値 (ms)。指数バックオフの底として使用 */
  retryBaseDelayMs: 2000,
  /** リトライ間隔の上限 (ms)。バックオフが際限なく伸びないよう制限 */
  retryMaxDelayMs: 30000,
} as const;
