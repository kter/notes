/**
 * セッション失効時に表示するバナーコンポーネント。
 * useAuth().sessionExpired が true のときに表示し、再ログイン導線を提供する。
 * 自動サインアウトはしない。再ログイン後に sessionExpired が false になりバナーが消える。
 *
 * 主なエクスポート:
 * - SessionExpiredBanner: セッション失効通知バナー
 *
 * 呼び出し関係: AuthenticatedWorkspace から fixed 表示で使用される。
 */
"use client";

import Link from "next/link";
import { LogInIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

/**
 * セッション失効バナー。
 * sessionExpired フラグを auth-context から直接読むため props 不要。
 * 表示されていない場合は何も描画しない。
 */
export function SessionExpiredBanner({ className }: { className?: string }) {
  const { sessionExpired } = useAuth();
  const { t } = useTranslation();

  if (!sessionExpired) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 text-xs rounded-full",
        "bg-background/80 backdrop-blur-sm border border-destructive/40",
        "shadow-sm text-destructive",
        className
      )}
    >
      <LogInIcon className="h-4 w-4 shrink-0" />
      <span className="text-muted-foreground">{t("sync.sessionExpired")}</span>
      <Button asChild size="sm" variant="outline" className="h-6 px-2 text-xs shrink-0">
        <Link href="/login">{t("auth.login")}</Link>
      </Button>
    </div>
  );
}
