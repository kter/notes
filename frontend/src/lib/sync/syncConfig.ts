export const SYNC_RETRY_CONFIG = {
  maxRetryAttempts: 3,
  retryBaseDelayMs: 2000,
  retryMaxDelayMs: 30000,
} as const;
