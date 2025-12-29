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
import { useApi, useTranslation } from "@/hooks";
import type { AvailableModel, AvailableLanguage } from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
}: SettingsDialogProps) {
  const { getApi } = useApi();
  const { t, language, setLanguage } = useTranslation();
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>(language);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [availableLanguages, setAvailableLanguages] = useState<AvailableLanguage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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
        const apiClient = await getApi();
        const response = await apiClient.getSettings();
        console.log("Settings API response:", response);

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
        console.error("Failed to load settings:", err);
        setError(t("settings.loadError"));
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
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
      // Update the language context
      setLanguage(selectedLanguage as "auto" | "ja" | "en");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
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
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `notes_export_${new Date().toISOString().split('T')[0]}.zip`);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export notes:", err);
      setError(t("common.error"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>
            {t("settings.description")}
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
            {/* Language Selection */}
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
                  {availableLanguages?.map((lang) => (
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

            {/* AI Model Selection */}
            <div className="space-y-2">
              <Label htmlFor="model-select">{t("settings.aiModel")}</Label>
              <Select
                value={selectedModelId}
                onValueChange={setSelectedModelId}
              >
                <SelectTrigger id="model-select">
                  <SelectValue placeholder={t("settings.selectModel")} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels?.map((model) => (
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

            <div className="border-t pt-6 space-y-4">
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
                  <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {t("settings.exportButton")}
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                ) : saveSuccess ? (
                  <CheckIcon className="h-4 w-4 mr-2" />
                ) : null}
                {saveSuccess ? t("common.saved") : t("common.save")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
