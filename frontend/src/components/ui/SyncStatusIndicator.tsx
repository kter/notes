"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks";
import { CloudOffIcon, Loader2Icon, AlertCircleIcon, CheckCircleIcon } from "lucide-react";
import type { SyncStatus } from "@/lib/syncQueue";

interface SyncStatusIndicatorProps {
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingChangesCount: number;
  savedLocally?: boolean;
  className?: string;
}

export function SyncStatusIndicator({
  isOnline,
  syncStatus,
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
        message: t("sync.syncError"),
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
