/**
 * オフライン・同期中・エラーなどのネットワーク同期状態をバッジとして表示するコンポーネント。
 * オンラインかつ同期済みの場合は何も描画しない。
 *
 * 主なエクスポート:
 * - SyncStatusIndicator: 同期ステータスバッジ
 *
 * 呼び出し関係: AuthenticatedWorkspace から fixed 表示で使用される。
 */
"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks";
import { CloudOffIcon, Loader2Icon, AlertCircleIcon, CheckCircleIcon } from "lucide-react";
import type { SyncStatus } from "@/lib/syncQueue";

interface SyncStatusIndicatorProps {
  isOnline: boolean;
  syncStatus: SyncStatus;
  lastErrorMessage?: string | null;
  pendingChangesCount: number;
  savedLocally?: boolean;
  className?: string;
}

/**
 * 同期ステータスインジケーター。
 * isOnline / syncStatus の組み合わせに応じてアイコンとメッセージを決定し、
 * pendingChangesCount が 0 超の場合は未反映件数を合わせて表示する。
 */
export function SyncStatusIndicator({
  isOnline,
  syncStatus,
  lastErrorMessage,
  pendingChangesCount,
  savedLocally = false,
  className,
}: SyncStatusIndicatorProps) {
  const { t } = useTranslation();

  // Determine icon and message based on status
  const getStatusInfo = () => {
    if (!isOnline || syncStatus === "offline") {
      return {
        icon: <CloudOffIcon className="h-4 w-4 text-amber-500" />,
        message: t("sync.offline"),
        showPending: true,
      };
    }

    if (syncStatus === "syncing") {
      return {
        icon: <Loader2Icon className="h-4 w-4 text-blue-500 animate-spin" />,
        message: t("sync.syncing"),
        showPending: false,
      };
    }

    if (syncStatus === "error") {
      return {
        icon: <AlertCircleIcon className="h-4 w-4 text-red-500" />,
        message: lastErrorMessage ?? t("sync.syncError"),
        showPending: true,
      };
    }

    // Online and idle
    if (savedLocally) {
      return {
        icon: <CheckCircleIcon className="h-4 w-4 text-green-500" />,
        message: t("sync.savedLocally"),
        showPending: false,
      };
    }

    // Hide when online and synced
    return null;
  };

  const statusInfo = getStatusInfo();

  // Don't render if online and synced
  if (!statusInfo) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-xs rounded-full",
        "bg-background/80 backdrop-blur-sm border border-border/50",
        "shadow-sm",
        className
      )}
    >
      {statusInfo.icon}
      <span className="text-muted-foreground">{statusInfo.message}</span>
      {statusInfo.showPending && pendingChangesCount > 0 && (
        <span className="text-muted-foreground">
          ({t("sync.pendingChanges").replace("{{count}}", String(pendingChangesCount))})
        </span>
      )}
    </div>
  );
}
