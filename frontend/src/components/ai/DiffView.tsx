/**
 * AI Edit の提案内容（元テキスト vs 編集後テキスト）を行単位の diff として表示するコンポーネント。
 * 承認・却下後はインラインでステータスバッジに切り替わる。
 *
 * 主なエクスポート:
 * - DiffView: diff 表示＋承認/却下ボタンコンポーネント
 *
 * 呼び出し関係: EditorPanel の pendingEditProposal 表示で使用される。
 */
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
  fullSize?: boolean;
}

/**
 * 差分ビュー本体。
 * isApplied が非 null の場合は承認/却下済みバッジを返し、それ以外は diff + 操作ボタンを描画する。
 * fullSize=true の場合はフレックス全体に広がるレイアウトを取る（EditorPanel の全幅表示用）。
 */
export function DiffView({
  originalContent,
  editedContent,
  onAccept,
  onReject,
  isApplied,
  fullSize,
}: DiffViewProps) {
  const { t } = useTranslation();
  // 元テキストと編集後テキストを行単位で比較し、差分チャンクを生成する
  const changes = diffLines(originalContent, editedContent);

  if (isApplied) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs px-3 py-2 rounded-md mt-2 font-medium border",
          isApplied === "accepted"
            ? "border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-300"
            : "border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-300"
        )}
        data-testid="diff-resolved"
      >
        {isApplied === "accepted" ? (
          <CheckIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <XIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        {isApplied === "accepted"
          ? t("aiEdit.accepted")
          : t("aiEdit.rejected")}
      </div>
    );
  }

  return (
    <div className={cn("mt-2", fullSize && "flex flex-col flex-1 min-h-0")} data-testid="diff-view">
      <ScrollArea className={cn(
        "rounded-md border border-border/50 bg-muted/30",
        fullSize ? "flex-1 min-h-0" : "max-h-[300px]"
      )}>
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
      <div className="flex gap-2 mt-2 shrink-0">
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
