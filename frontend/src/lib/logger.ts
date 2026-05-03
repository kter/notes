/**
 * アプリケーション全体で使用するログユーティリティ。
 * コンソール出力と Sentry への送信を一元管理し、ログレベルに応じて送信先を切り替える。
 *
 * 主なエクスポート:
 * - logger: debug / info / warn / error / setUser メソッドを持つシングルトンオブジェクト
 *
 * 呼び出し関係: アプリ全域から参照され、warn/error 時に Sentry へ転送する。
 */
import * as Sentry from "@sentry/nextjs";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown>;

/**
 * Sentry の breadcrumb level 型に合わせて "warn" を "warning" へ変換する。
 */
function toSentryLevel(level: LogLevel): "debug" | "info" | "warning" | "error" {
  return level === "warn" ? "warning" : level;
}

/**
 * 開発環境かどうかを返す。debug/info ログをコンソールに出力するかの判定に使う。
 */
function isVerboseConsoleEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * コンテキスト値を Sentry の data オブジェクトとして渡せる形に正規化する。
 * Error インスタンスはプロパティを展開し、プリミティブは { value } でラップする。
 */
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

/**
 * ログレベルと環境に応じてコンソールへ出力する。
 * debug/info は開発環境のみ出力し、本番では抑制する。
 */
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

/**
 * Sentry へブレッドクラムを追加し、warn/error レベルに応じてイベントを送信する。
 * context が Error インスタンスの場合は captureException、それ以外は captureMessage を使う。
 */
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

/**
 * コンソール出力と Sentry 送信を組み合わせたロギングの中心関数。
 * warn/error の場合のみ Sentry に転送する。
 */
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
