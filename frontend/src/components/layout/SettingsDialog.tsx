import { useEffect, useState } from "react";
import Image from "next/image";
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
import { logger } from "@/lib/logger";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { useApi, useTranslation } from "@/hooks";
import type {
  AvailableLanguage,
  AvailableModel,
  TokenUsageRead,
} from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenUsage?: TokenUsageRead | null;
}

export function SettingsDialog({
  open,
  onOpenChange,
  tokenUsage,
}: SettingsDialogProps) {
  const { getApi } = useApi();
  const { t, language, setLanguage } = useTranslation();
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>(language);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<AvailableLanguage[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      if (!open) return;
      setIsLoading(true);
      setError(null);
      setSaveSuccess(false);

      try {
        const apiClient = await getApi();
        const response = await apiClient.getSettings();
        logger.debug("Settings API response received", {
          has_settings: Boolean(response?.settings),
          available_model_count: response?.available_models?.length ?? 0,
          available_language_count: response?.available_languages?.length ?? 0,
        });

        if (response?.settings) {
          setSelectedModelId(response.settings.llm_model_id);
          setSelectedLanguage(response.settings.language);
        }

        if (response?.available_models) {
          setAvailableModels(response.available_models);
        }

        if (response?.available_languages) {
          setAvailableLanguages(response.available_languages);
        }
      } catch (err) {
        logger.error("Failed to load settings", err);
        setError(t("settings.loadError"));
      } finally {
        setIsLoading(false);
      }
    }

    void loadSettings();
  }, [open, getApi, t]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const apiClient = await getApi();
      await apiClient.updateSettings({
        llm_model_id: selectedModelId,
        language: selectedLanguage,
      });
      setLanguage(selectedLanguage as "auto" | "ja" | "en");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      logger.error("Failed to save settings", err);
      setError(t("settings.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    try {
      const apiClient = await getApi();
      const blob = await apiClient.exportNotes();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `notes_export_${new Date().toISOString().split("T")[0]}.zip`
      );
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      logger.error("Failed to export notes", err);
      setError(t("common.error"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.description")}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2Icon className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-4 text-sm text-red-500">{error}</div>
        ) : (
          <div className="flex max-h-[80vh] flex-col overflow-hidden">
            <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4 pr-6 -mr-6">
              <div className="space-y-2">
                <Label htmlFor="language-select">{t("settings.language")}</Label>
                <Select
                  value={selectedLanguage}
                  onValueChange={setSelectedLanguage}
                >
                  <SelectTrigger id="language-select">
                    <SelectValue placeholder={t("settings.selectLanguage")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLanguages.map((lang) => (
                      <SelectItem key={lang.id} value={lang.id}>
                        <div className="flex flex-col">
                          <span>{lang.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {lang.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("settings.languageDescription")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="model-select">{t("settings.aiModel")}</Label>
                <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                  <SelectTrigger id="model-select">
                    <SelectValue placeholder={t("settings.selectModel")} />
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
                  {t("settings.aiModelDescription")}
                </p>
              </div>

              {tokenUsage && (
                <div className="space-y-4 border-t pt-6">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium leading-none">
                      {t("tokenUsage.title")}
                    </h4>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>
                        {new Intl.NumberFormat().format(tokenUsage.tokens_used)} /{" "}
                        {new Intl.NumberFormat().format(tokenUsage.token_limit)}{" "}
                        {t("tokenUsage.used").split(" ")[0]}
                      </span>
                      <span>
                        {t("tokenUsage.resetDate")}:{" "}
                        {new Date(tokenUsage.period_end).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      style={{
                        width: `${Math.min(
                          100,
                          tokenUsage.token_limit > 0
                            ? (tokenUsage.tokens_used / tokenUsage.token_limit) * 100
                            : 0
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-4 border-t pt-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium leading-none">
                    {t("settings.exportTitle")}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.exportDescription")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleExport}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t("settings.exportButton")}
                </Button>
              </div>

              <div className="space-y-4 border-t pt-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium leading-none">
                    {t("settings.supportTitle")}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.supportDescription")}
                  </p>
                </div>
                <a
                  href="https://ko-fi.com/J3J41LWG90"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Image
                    width={180}
                    height={36}
                    style={{ border: 0, height: "36px", width: "auto" }}
                    src="https://storage.ko-fi.com/cdn/kofi3.png?v=6"
                    alt="Buy Me a Coffee at ko-fi.com"
                    unoptimized
                  />
                </a>
              </div>

              <div className="mt-auto flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  ) : saveSuccess ? (
                    <CheckIcon className="mr-2 h-4 w-4" />
                  ) : null}
                  {saveSuccess ? t("common.saved") : t("common.save")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
