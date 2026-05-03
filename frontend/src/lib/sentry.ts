/**
 * Sentry の初期化設定を構築するユーティリティ。
 * 環境（開発/本番）に応じてサンプリングレートを切り替え、ブラウザ向け設定オブジェクトを返す。
 *
 * 主なエクスポート:
 * - getSentryBrowserConfig: ブラウザ用 Sentry 設定オブジェクトを返す
 * - getTracePropagationTargets: トレース伝播対象 URL リストを返す
 *
 * 呼び出し関係: instrumentation.ts や sentry.client.config.ts から呼び出される。
 */
import * as Sentry from "@sentry/nextjs";

const DEV_TRACES_SAMPLE_RATE = 1.0;
const PROD_TRACES_SAMPLE_RATE = 0.1;
const DEV_REPLAY_SESSION_SAMPLE_RATE = 1.0;
const PROD_REPLAY_SESSION_SAMPLE_RATE = 0.1;
const REPLAY_ERROR_SAMPLE_RATE = 1.0;

/**
 * Sentry のトレース伝播対象 URL リストを返す。
 * デフォルトで localhost と相対パスを含み、API_URL が設定されていれば追加する。
 */
export function getTracePropagationTargets(apiUrl = process.env.NEXT_PUBLIC_API_URL) {
  const targets: Array<string | RegExp> = ["localhost", /^\//];

  if (apiUrl) {
    targets.push(apiUrl);
  }

  return targets;
}

/**
 * 環境変数と実行環境から Sentry ブラウザ設定を組み立てて返す。
 * DSN が未設定の場合は enabled: false となり Sentry への送信を無効化する。
 * 本番ではサンプリングレートを低く抑えてパフォーマンス影響を最小化する。
 */
export function getSentryBrowserConfig() {
  const isDevelopment = process.env.NODE_ENV === "development";
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: isDevelopment ? DEV_TRACES_SAMPLE_RATE : PROD_TRACES_SAMPLE_RATE,
    replaysSessionSampleRate: isDevelopment
      ? DEV_REPLAY_SESSION_SAMPLE_RATE
      : PROD_REPLAY_SESSION_SAMPLE_RATE,
    replaysOnErrorSampleRate: REPLAY_ERROR_SAMPLE_RATE,
    tracePropagationTargets: getTracePropagationTargets(),
    integrations: [
      Sentry.browserTracingIntegration({
        shouldCreateSpanForRequest: (url) => !url.endsWith("/health"),
      }),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  };
}
