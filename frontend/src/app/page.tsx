/**
 * アプリケーションのルートページ。認証状態に応じてランディングページまたは認証済みワークスペースを表示する。
 *
 * 主なエクスポート:
 * - Home: ルートページコンポーネント
 *
 * 呼び出し関係: Next.js App Router の `/` ルート (app/page.tsx)。
 */
"use client";

import { Suspense, useEffect } from "react";
import { LandingPage } from "@/components/landing";
import { AuthenticatedWorkspace } from "@/components/workspace";
import { useAuth } from "@/lib/auth-context";
import { Loader2Icon } from "lucide-react";

/**
 * ルートページコンポーネント。認証ローディング中はスピナーを表示し、未認証ならランディングページ、認証済みならワークスペースを描画する。
 * マウント時に管理者ホスト名を検出した場合は `/admin/` へリダイレクトする副作用を持つ。
 */
export default function Home() {
  const { user, isLoading: authLoading, isAuthenticated, signOut } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hostname = window.location.hostname;
    const isAdminHost = hostname === "admin.notes.devtools.site" || hostname === "admin.notes.dev.devtools.site";
    if (isAdminHost && window.location.pathname === "/") {
      window.location.replace("/admin/");
    }
  }, []);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-background">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AuthenticatedWorkspace userEmail={user?.email} onSignOut={signOut} />
    </Suspense>
  );
}
