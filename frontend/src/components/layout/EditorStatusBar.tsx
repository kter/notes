/**
 * エディタ下部のステータスバーコンポーネント。
 * 同期状態・文字数・最終保存時刻を左右に、時計・天気・トークン使用量を中央に表示する。
 *
 * 主なエクスポート:
 * - EditorStatusBar: エディタステータスバーコンポーネント
 *
 * 呼び出し関係: EditorPanel から使用される。
 */
"use client";

import { memo } from "react";
import { CheckIcon, Loader2Icon, HashIcon } from "lucide-react";
import { Clock } from "@/components/Clock";
import { WeatherWidget } from "@/components/WeatherWidget";
import { TokenUsageIndicator } from "@/components/TokenUsageIndicator";
import type { TokenUsageRead } from "@/types";
import type { SyncStatus } from "@/hooks/useNotes";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/hooks";

interface EditorStatusBarProps {
  contentLength: number;
  currentHash: string;
  savedHash: string | undefined;
  syncStatus: SyncStatus;
  tokenUsage: TokenUsageRead | null | undefined;
  updatedAt: string;
}

/**
 * ステータスバー本体。
 * currentHash と savedHash を比較して未保存状態を検出し、
 * isSaving / remoteStatus / retryCountdown に応じてアイコンとテキストを切り替える。
 */
export const EditorStatusBar = memo(function EditorStatusBar({
  contentLength,
  currentHash,
  savedHash,
  syncStatus,
  tokenUsage,
  updatedAt,
}: EditorStatusBarProps) {
  const { t } = useTranslation();
  const { remote: remoteStatus, lastError, isSaving, retryCountdown } = syncStatus;

  const isStrictlyMismatch = !!savedHash && !!currentHash && savedHash !== currentHash;
  const isLooselyMismatch = !savedHash && remoteStatus === "unsynced";

  let statusIcon = null;
  let statusText = "";
  let statusTooltip = "";
  let statusColorClass = "";

  if (isSaving) {
    statusIcon = <Loader2Icon className="h-3 w-3 animate-spin" />;
    statusText = t("common.loading");
    statusTooltip = t("sync.savingRemote");
    statusColorClass = "text-muted-foreground";
  } else if (remoteStatus === "failed") {
    statusIcon = <CheckIcon className="h-3 w-3" />;
    statusText = t("sync.failedSavedLocally");
    if (retryCountdown !== undefined) {
      statusText += " " + t("sync.retryingIn").replace("{{seconds}}", String(retryCountdown));
    }
    statusTooltip = t("sync.remoteSaveFailed");
    statusColorClass = "text-orange-500";
  } else if (isStrictlyMismatch || isLooselyMismatch) {
    statusIcon = <div className="h-2 w-2 rounded-full bg-orange-300" />;
    statusText = t("editor.unsaved");
    statusTooltip = isStrictlyMismatch
      ? t("editor.unsavedStrictMismatch")
      : t("editor.unsavedLooseMismatch");
    statusColorClass = "text-muted-foreground";
  } else {
    statusIcon = <CheckIcon className="h-3 w-3" />;
    statusText = t("common.saved");
    statusTooltip = t("sync.savedVerified");
    statusColorClass = "text-green-500";
  }

  if (lastError) {
    statusTooltip += ` (${lastError})`;
  }

  return (
    <div className="relative flex flex-wrap items-center justify-between px-4 md:px-6 py-2 border-t border-border/50 text-xs text-muted-foreground gap-y-2">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1" data-testid="sync-status">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`flex items-center gap-1 cursor-help ${statusColorClass}`}>
                  {statusIcon}
                  <span className="font-medium">{statusText}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{statusTooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-1 border-l border-border/50 pl-4">
          <HashIcon className="h-3 w-3" />
          <span>
            {t("editor.characters")}:{" "}
            <span className="font-medium text-foreground">{contentLength}</span>
          </span>
        </div>
      </div>

      {/* Clock, Weather and Token Usage — absolutely centered */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4">
        <Clock />
        <WeatherWidget />
        {tokenUsage && (
          <TokenUsageIndicator
            tokensUsed={tokenUsage.tokens_used}
            tokenLimit={tokenUsage.token_limit}
            resetDate={tokenUsage.period_end}
          />
        )}
      </div>

      <div className="whitespace-nowrap">
        {t("editor.lastSaved")}:{" "}
        {new Date(updatedAt).toLocaleString(undefined, {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
});
