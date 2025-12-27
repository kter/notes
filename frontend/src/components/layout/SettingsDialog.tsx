"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2Icon, CheckIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { AvailableModel } from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getAccessToken: () => Promise<string | null>;
}

export function SettingsDialog({
  open,
  onOpenChange,
  getAccessToken,
}: SettingsDialogProps) {
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings when dialog opens
  useEffect(() => {
    async function loadSettings() {
      if (!open) return;

      setIsLoading(true);
      setError(null);
      setSaveSuccess(false);

      try {
        const token = await getAccessToken();
        if (token) api.setToken(token);

        const response = await api.getSettings();
        setSelectedModelId(response.settings.llm_model_id);
        setAvailableModels(response.available_models);
      } catch (err) {
        console.error("Failed to load settings:", err);
        setError("設定の読み込みに失敗しました");
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, [open, getAccessToken]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);

      await api.updateSettings({ llm_model_id: selectedModelId });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError("設定の保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>設定</DialogTitle>
          <DialogDescription>
            アプリケーションの設定を変更します
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-sm text-red-500 py-4">{error}</div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="model-select">AIモデル</Label>
              <Select
                value={selectedModelId}
                onValueChange={setSelectedModelId}
              >
                <SelectTrigger id="model-select">
                  <SelectValue placeholder="モデルを選択" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col">
                        <span>{model.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {model.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                タイトル生成、要約、チャットで使用するAIモデルを選択します
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                キャンセル
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                ) : saveSuccess ? (
                  <CheckIcon className="h-4 w-4 mr-2" />
                ) : null}
                {saveSuccess ? "保存しました" : "保存"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
