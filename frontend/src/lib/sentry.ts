import * as Sentry from "@sentry/nextjs";

const DEV_TRACES_SAMPLE_RATE = 1.0;
const PROD_TRACES_SAMPLE_RATE = 0.1;
const DEV_REPLAY_SESSION_SAMPLE_RATE = 1.0;
const PROD_REPLAY_SESSION_SAMPLE_RATE = 0.1;
const REPLAY_ERROR_SAMPLE_RATE = 1.0;

export function getTracePropagationTargets(apiUrl = process.env.NEXT_PUBLIC_API_URL) {
  const targets: Array<string | RegExp> = ["localhost", /^\//];

  if (apiUrl) {
    targets.push(apiUrl);
  }

  return targets;
}

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
