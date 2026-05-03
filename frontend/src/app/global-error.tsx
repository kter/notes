/**
 * Next.js のグローバルエラーバウンダリ。捕捉した例外を Sentry へ送信し、汎用エラー画面を表示する。
 *
 * 主なエクスポート:
 * - GlobalError: グローバルエラーハンドラーコンポーネント
 *
 * 呼び出し関係: Next.js App Router の global-error.tsx として自動適用される。
 */
"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/**
 * グローバルエラーハンドラー。error が変化するたびに Sentry へ例外を送信し、Next.js 標準のエラーページを表示する。
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
