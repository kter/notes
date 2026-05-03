/**
 * AI トークン使用量をインジケーターとして表示するコンポーネント。
 * 使用率に応じて緑・黄・赤でアイコン色を変え、ホバー時にリセット日をツールチップで表示する。
 *
 * 主なエクスポート:
 * - TokenUsageIndicator: トークン使用量バッジコンポーネント
 *
 * 呼び出し関係: EditorStatusBar から使用される。
 */
"use client";

import { memo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { FlameIcon } from "lucide-react";

interface TokenUsageIndicatorProps {
    tokensUsed: number;
    tokenLimit: number;
    resetDate: string;
}

/**
 * トークン使用量を視覚的に表示するインジケーター。
 * usageRatio が 0.7 以上で黄色、0.9 以上で赤に変化し、上限に近づいていることをユーザーに警告する。
 */
export const TokenUsageIndicator = memo(function TokenUsageIndicator({
    tokensUsed,
    tokenLimit,
    resetDate,
}: TokenUsageIndicatorProps) {
    const { t } = useTranslation();

    const usageRatio = tokenLimit > 0 ? tokensUsed / tokenLimit : 0;

    let colorClass = "text-green-500";
    if (usageRatio >= 0.9) {
        colorClass = "text-red-500";
    } else if (usageRatio >= 0.7) {
        colorClass = "text-yellow-500";
    }

    const formattedUsed = new Intl.NumberFormat().format(tokensUsed);
    const formattedLimit = new Intl.NumberFormat().format(tokenLimit);

    // Format date correctly handling UTC from backend
    const dateObj = new Date(resetDate);
    const formattedDate = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString()
        : "-";

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 text-xs font-mono cursor-help bg-accent/50 hover:bg-accent px-2 py-1 rounded-md transition-colors" data-testid="token-usage-indicator">
                        <FlameIcon className={`h-3 w-3 ${colorClass}`} />
                        <span className={colorClass}>{formattedUsed}</span>
                        <span className="text-muted-foreground mr-0.5">/</span>
                        <span className="text-muted-foreground">{formattedLimit}</span>
                    </div>
                </TooltipTrigger>
                <TooltipContent align="end" sideOffset={5}>
                    <div className="space-y-1 text-sm font-sans">
                        <p><span className="font-semibold">{t("tokenUsage.title")}</span></p>
                        <p className="text-muted-foreground">{t("tokenUsage.resetDate")}: {formattedDate}</p>
                    </div>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
});
