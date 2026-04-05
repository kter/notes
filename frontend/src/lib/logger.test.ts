import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "./logger";

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("suppresses info logs in production console output", () => {
    process.env.NODE_ENV = "production";
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    logger.info("Informational message");

    expect(consoleInfo).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("sends warnings to console and Sentry", () => {
    process.env.NODE_ENV = "production";
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logger.warn("Sync warning", { failedCount: 2 });

    expect(consoleWarn).toHaveBeenCalledWith("Sync warning", { failedCount: 2 });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Sync warning",
        level: "warning",
      }),
    );
    expect(Sentry.captureMessage).toHaveBeenCalledWith("Sync warning", "warning");
  });

  it("captures exceptions for error logs", () => {
    process.env.NODE_ENV = "production";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("boom");

    logger.error("Unexpected failure", error);

    expect(consoleError).toHaveBeenCalledWith("Unexpected failure", error);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Unexpected failure",
        level: "error",
      }),
    );
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
