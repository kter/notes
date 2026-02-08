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

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string | null;
  isLoading: boolean;
  onCreateShare: () => void;
  onRevokeShare: () => void;
}

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

  const handleCopy = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevoke = () => {
    if (confirm(t("share.revokeConfirm"))) {
      onRevokeShare();
    }
  };

  return (
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
  );
}
