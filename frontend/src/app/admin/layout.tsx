"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * /admin ルート全体に適用するクライアントサイド認証ガードレイアウト。
 * AWS Amplify はトークンを localStorage に保持するため Next.js middleware では
 * 読み取れない。そのためクライアントコンポーネントとして認証状態を確認する。
 *
 * - 認証チェック中: スピナーを表示
 * - 未認証: "/" にリダイレクト
 * - 認証済み: children をレンダリング（管理者権限チェックは AdminConsole が担当）
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // router.replace("/") is in flight; render nothing to avoid flash
    return null;
  }

  return <>{children}</>;
}
