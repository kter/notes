import * as Sentry from "@sentry/nextjs";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

function toSentryLevel(level: LogLevel): "debug" | "info" | "warning" | "error" {
  return level === "warn" ? "warning" : level;
}

function isVerboseConsoleEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

function normalizeContext(context?: unknown): LogContext | undefined {
  if (context === undefined) {
    return undefined;
  }

  if (context instanceof Error) {
    return {
      error_name: context.name,
      error_message: context.message,
    };
  }

  if (typeof context === "object" && context !== null) {
    return context as LogContext;
  }

  return { value: context };
}

function writeConsole(level: LogLevel, message: string, context?: unknown): void {
  if ((level === "debug" || level === "info") && !isVerboseConsoleEnabled()) {
    return;
  }

  const method =
    level === "debug"
      ? console.debug
      : level === "info"
        ? console.info
        : level === "warn"
          ? console.warn
          : console.error;

  if (context === undefined) {
    method(message);
    return;
  }

  method(message, context);
}

function writeSentry(level: LogLevel, message: string, context?: unknown): void {
  const data = normalizeContext(context);

  Sentry.addBreadcrumb({
    category: "app.logger",
    level: toSentryLevel(level),
    message,
    data,
  });

  if (level === "warn") {
    Sentry.captureMessage(message, "warning");
    return;
  }

  if (level !== "error") {
    return;
  }

  if (context instanceof Error) {
    Sentry.captureException(context);
    return;
  }

  Sentry.captureMessage(message, "error");
}

function log(level: LogLevel, message: string, context?: unknown): void {
  writeConsole(level, message, context);
  if (level === "warn" || level === "error") {
    writeSentry(level, message, context);
  }
}

export const logger = {
  debug(message: string, context?: unknown) {
    log("debug", message, context);
  },
  info(message: string, context?: unknown) {
    log("info", message, context);
  },
  warn(message: string, context?: unknown) {
    log("warn", message, context);
  },
  error(message: string, context?: unknown) {
    log("error", message, context);
  },
  setUser(userId: string | null) {
    Sentry.setUser(userId ? { id: userId } : null);
  },
};
