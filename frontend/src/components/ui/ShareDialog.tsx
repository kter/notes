/**
 * ノートの共有リンクを管理するダイアログコンポーネント。
 * 共有リンクの生成・コピー・削除（revoke）を一画面で操作できる。
 *
 * 主なエクスポート:
 * - ShareDialog: 共有リンク管理ダイアログ
 *
 * 呼び出し関係: EditorToolbar から使用される。
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CopyIcon, CheckIcon, Trash2Icon, Loader2Icon, LinkIcon } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string | null;
  isLoading: boolean;
  onCreateShare: () => void;
  onRevokeShare: () => void;
}

/**
 * 共有ダイアログ本体。
 * shareUrl が null の場合は「共有リンク作成」ボタンを、存在する場合はコピー・削除 UI を表示する。
 * isLoading 中はスピナーを表示してユーザー操作をブロックする。
 */
export function ShareDialog({
  isOpen,
  onClose,
  shareUrl,
  isLoading,
  onCreateShare,
  onRevokeShare,
}: ShareDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);

  /** 共有 URL をクリップボードにコピーし、2 秒間コピー完了フィードバックを表示する。 */
  const handleCopy = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /** 確認ダイアログを表示し、ユーザーが承認した場合のみ共有リンクを削除する。 */
  const handleRevoke = () => {
    setConfirmRevokeOpen(true);
  };

  return (
    <>
    <ConfirmDialog
      open={confirmRevokeOpen}
      onOpenChange={setConfirmRevokeOpen}
      title={t("share.revokeShare")}
      description={t("share.revokeConfirm")}
      onConfirm={onRevokeShare}
    />
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle>{t("share.title")}</DialogTitle>
          <DialogDescription>{t("share.description")}</DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : shareUrl ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="flex-1 font-mono text-sm"
                data-testid="share-url-input"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                data-testid="share-copy-button"
              >
                {copied ? (
                  <CheckIcon className="h-4 w-4 text-green-500" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            {copied && (
              <p className="text-sm text-green-600">{t("share.copied")}</p>
            )}
            
            <div className="flex justify-between items-center pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                {t("share.viewOnlyNotice")}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleRevoke}
                data-testid="share-revoke-button"
              >
                <Trash2Icon className="h-4 w-4 mr-1" />
                {t("share.revokeShare")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-muted-foreground">{t("share.noShare")}</p>
            <Button onClick={onCreateShare} data-testid="share-create-button">
              <LinkIcon className="h-4 w-4 mr-2" />
              {t("share.createShare")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
