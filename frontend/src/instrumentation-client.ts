/**
 * Next.js クライアントサイドインストゥルメンテーションのエントリポイント。
 * ブラウザ向け Sentry の初期化と、ルーター遷移のトレース開始フックを設定する。
 *
 * 主なエクスポート:
 * - onRouterTransitionStart: Next.js がルーター遷移開始時に呼び出すフック
 *
 * 呼び出し関係: Next.js フレームワークが自動的に読み込む。直接呼び出す箇所はない。
 */
import * as Sentry from "@sentry/nextjs";
import { getSentryBrowserConfig } from "@/lib/sentry";

Sentry.init(getSentryBrowserConfig());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
