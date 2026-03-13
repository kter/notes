import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getSentryBrowserConfig, getTracePropagationTargets } from "./sentry";

describe("Sentry browser config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/123";
    process.env.NEXT_PUBLIC_ENVIRONMENT = "dev";
    process.env.NODE_ENV = "development";
  });

  it("adds the backend API to trace propagation targets", () => {
    expect(getTracePropagationTargets()).toEqual([
      "localhost",
      /^\//,
      "https://api.example.com",
    ]);
  });

  it("builds a development config with tracing and replay privacy defaults", () => {
    const config = getSentryBrowserConfig();

    expect(config.enabled).toBe(true);
    expect(config.dsn).toBe("https://public@example.ingest.sentry.io/123");
    expect(config.environment).toBe("dev");
    expect(config.tracesSampleRate).toBe(1);
    expect(config.replaysSessionSampleRate).toBe(1);
    expect(config.replaysOnErrorSampleRate).toBe(1);
    expect(config.tracePropagationTargets).toEqual([
      "localhost",
      /^\//,
      "https://api.example.com",
    ]);
    expect(Sentry.browserTracingIntegration).toHaveBeenCalledWith({
      shouldCreateSpanForRequest: expect.any(Function),
    });
    expect(Sentry.replayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      blockAllMedia: true,
    });
  });

  it("uses lower production sample rates", () => {
    process.env.NODE_ENV = "production";

    const config = getSentryBrowserConfig();

    expect(config.tracesSampleRate).toBe(0.1);
    expect(config.replaysSessionSampleRate).toBe(0.1);
    expect(config.replaysOnErrorSampleRate).toBe(1);
  });

  it("disables Sentry when the browser DSN is not configured", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;

    const config = getSentryBrowserConfig();

    expect(config.enabled).toBe(false);
    expect(config.dsn).toBeUndefined();
  });
});
