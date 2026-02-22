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
