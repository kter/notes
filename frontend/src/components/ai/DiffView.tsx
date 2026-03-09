import { diffLines } from "diff";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckIcon, XIcon } from "lucide-react";
import { useTranslation } from "@/hooks";
import { cn } from "@/lib/utils";

interface DiffViewProps {
  originalContent: string;
  editedContent: string;
  onAccept: () => void;
  onReject: () => void;
  isApplied?: "accepted" | "rejected" | null;
}

export function DiffView({
  originalContent,
  editedContent,
  onAccept,
  onReject,
  isApplied,
}: DiffViewProps) {
  const { t } = useTranslation();
  const changes = diffLines(originalContent, editedContent);

  if (isApplied) {
    return (
      <div
        className={cn(
          "text-xs px-3 py-2 rounded-md mt-2",
          isApplied === "accepted"
            ? "bg-green-500/10 text-green-700 dark:text-green-400"
            : "bg-red-500/10 text-red-700 dark:text-red-400"
        )}
        data-testid="diff-resolved"
      >
        {isApplied === "accepted"
          ? t("aiEdit.accepted")
          : t("aiEdit.rejected")}
      </div>
    );
  }

  return (
    <div className="mt-2" data-testid="diff-view">
      <ScrollArea className="max-h-[300px] rounded-md border border-border/50 bg-muted/30">
        <div className="font-mono text-xs p-2">
          {changes.map((change, idx) => {
            const lines = change.value.replace(/\n$/, "").split("\n");
            return lines.map((line, lineIdx) => (
              <div
                key={`${idx}-${lineIdx}`}
                className={cn(
                  "px-2 py-0.5 whitespace-pre-wrap break-all",
                  change.added && "bg-green-500/15 text-green-800 dark:text-green-300",
                  change.removed && "bg-red-500/15 text-red-800 dark:text-red-300 line-through"
                )}
              >
                <span className="select-none text-muted-foreground mr-2">
                  {change.added ? "+" : change.removed ? "-" : " "}
                </span>
                {line}
              </div>
            ));
          })}
        </div>
      </ScrollArea>
      <div className="flex gap-2 mt-2">
        <Button
          size="sm"
          variant="default"
          className="gap-1 h-7 text-xs"
          onClick={onAccept}
          data-testid="diff-accept-button"
        >
          <CheckIcon className="h-3 w-3" />
          {t("aiEdit.accept")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1 h-7 text-xs"
          onClick={onReject}
          data-testid="diff-reject-button"
        >
          <XIcon className="h-3 w-3" />
          {t("aiEdit.reject")}
        </Button>
      </div>
    </div>
  );
}
