import { beforeEach, describe, expect, it, vi } from "vitest";

describe("next.config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.SENTRY_AUTH_TOKEN = "token";
    process.env.SENTRY_ORG = "notes-org";
    process.env.SENTRY_PROJECT = "notes-frontend";
    delete process.env.CI;
  });

  it("wraps the Next.js config with Sentry build settings", async () => {
    const config = (await import("./next.config")).default as {
      _sentryOptions?: Record<string, string | boolean | undefined>;
      images: { unoptimized: boolean };
      output: string;
      trailingSlash: boolean;
    };

    expect(config.output).toBe("export");
    expect(config.trailingSlash).toBe(true);
    expect(config.images.unoptimized).toBe(true);
    expect(config._sentryOptions).toEqual({
      authToken: "token",
      org: "notes-org",
      project: "notes-frontend",
      widenClientFileUpload: true,
      silent: true,
    });
  });
});
