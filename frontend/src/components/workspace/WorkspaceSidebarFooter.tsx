/**
 * ワークスペースサイドバーの下部に配置されるフッターコンポーネント。
 * ユーザーメールアドレス・設定ボタン・サインアウトボタンを表示する。
 * isSidebarOpen が false の場合はボタンのみを中央配置にする。
 *
 * 主なエクスポート:
 * - WorkspaceSidebarFooter: サイドバーフッターコンポーネント
 *
 * 呼び出し関係: AuthenticatedWorkspace のサイドバースロット内で使用される。
 */
"use client";

import { memo } from "react";
import { LogOutIcon, SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks";

interface WorkspaceSidebarFooterProps {
  isSidebarOpen: boolean;
  userEmail?: string;
  onOpenSettings: () => void;
  onSignOut: () => void | Promise<void>;
}

export const WorkspaceSidebarFooter = memo(function WorkspaceSidebarFooter({
  isSidebarOpen,
  userEmail,
  onOpenSettings,
  onSignOut,
}: WorkspaceSidebarFooterProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "p-4 border-t border-border/50 transition-all duration-300",
        !isSidebarOpen && "items-center justify-center p-2",
        "pb-20 md:pb-4"
      )}
    >
      <div
        className={cn(
          "flex items-center",
          isSidebarOpen ? "justify-between" : "justify-center"
        )}
      >
        {isSidebarOpen && (
          <span className="text-xs text-muted-foreground truncate">{userEmail}</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onOpenSettings}
          title={t("sidebar.settings")}
          aria-label={t("sidebar.settings")}
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onSignOut}
          title={t("sidebar.logout")}
          aria-label={t("sidebar.logout")}
        >
          <LogOutIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
});
