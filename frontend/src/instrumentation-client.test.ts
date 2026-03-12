import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("instrumentation-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/123";
    process.env.NEXT_PUBLIC_ENVIRONMENT = "dev";
    process.env.NODE_ENV = "development";
  });

  it("initializes the browser SDK and exports router tracing", async () => {
    const instrumentationClient = await import("./instrumentation-client");

    expect(Sentry.init).toHaveBeenCalledTimes(1);
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://public@example.ingest.sentry.io/123",
        tracePropagationTargets: ["localhost", /^\//, "https://api.example.com"],
      }),
    );
    expect(instrumentationClient.onRouterTransitionStart).toBe(Sentry.captureRouterTransitionStart);
  });
});
