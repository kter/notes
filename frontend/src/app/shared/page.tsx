/**
 * 共有ノートの公開閲覧ページ。URL クエリパラメータのトークンを使って共有ノートを取得し、認証不要で閲覧できる。
 *
 * 主なエクスポート:
 * - SharedNotePage: 共有ノートページコンポーネント (Suspense ラッパー)
 * - SharedNoteContent: トークン取得・表示ロジックを持つ内部コンポーネント
 *
 * 呼び出し関係: Next.js App Router の `/shared` ルート (app/shared/page.tsx)。未認証ユーザーがアクセスする。
 */
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSharedNote, ApiError } from "@/lib/api";
import type { SharedNote } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2Icon } from "lucide-react";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

function SharedNoteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { t } = useTranslation();

  const [note, setNote] = useState<SharedNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchNote() {
      if (!token) {
        setError(t("shared.errorNoToken"));
        setIsLoading(false);
        return;
      }

      try {
        const sharedNote = await getSharedNote(token);
        setNote(sharedNote);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setError(t("shared.errorNotFound"));
          } else if (err.status === 410) {
            setError(t("shared.errorExpired"));
          } else {
            setError(t("shared.errorFailed"));
          }
        } else {
          setError(t("shared.errorFailed"));
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchNote();
  }, [token, t]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-foreground mb-4">
            {t("shared.notFoundTitle")}
          </h1>
          <p className="text-muted-foreground mb-8">
            {error || t("shared.errorFallback")}
          </p>
          <div className="flex justify-center gap-4">
            <Button asChild>
              <Link href="/">{t("shared.goHome")}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation Bar for Unauthenticated Users */}
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg flex items-center gap-2">
            {t("shared.appName")}
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{t("shared.logIn")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">{t("shared.signUpFree")}</Link>
            </Button>
          </div>
        </div>
      </nav>

      <div className="flex-1">
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="mb-8 pb-6 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  {t("shared.sharedNoteBadge")}
                </span>
                <span>•</span>
                <span>{t("shared.readOnly")}</span>
              </div>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2 break-words">
              {note.title || t("shared.untitled")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("shared.lastUpdated")}{" "}
              {new Date(note.updated_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </header>

          {/* Content */}
          <article className="markdown-preview prose prose-sm sm:prose-base dark:prose-invert max-w-none mb-16">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {note.content || t("shared.noContent")}
            </ReactMarkdown>
          </article>

          {/* Call to Action Banner */}
          <div className="rounded-xl border bg-card p-6 sm:p-8 text-center sm:text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <svg
                width="120"
                height="120"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>

            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="max-w-lg">
                <h3 className="text-xl font-semibold mb-2">
                  {t("shared.ctaTitle")}
                </h3>
                <p className="text-muted-foreground mb-0">
                  {t("shared.ctaDescription")}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Button size="lg" asChild className="w-full sm:w-auto">
                  <Link href="/register">{t("shared.getStartedFree")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            © {new Date().getFullYear()} {t("shared.appName")}. {t("shared.allRightsReserved")}
          </p>
          <div className="mt-2 flex justify-center gap-4">
            <Link href="/" className="hover:text-foreground transition-colors">
              {t("shared.home")}
            </Link>
            <Link
              href="/register"
              className="hover:text-foreground transition-colors"
            >
              {t("shared.signUp")}
            </Link>
            <Link
              href="/login"
              className="hover:text-foreground transition-colors"
            >
              {t("shared.logIn")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function SharedNotePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SharedNoteContent />
    </Suspense>
  );
}
