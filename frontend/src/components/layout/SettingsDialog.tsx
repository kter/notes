/**
 * ユーザー設定ダイアログコンポーネント。
 * 言語・AI モデルの変更保存、API キーの発行・失効、全ノートの ZIP エクスポートを一画面で提供する。
 *
 * 主なエクスポート:
 * - SettingsDialog: 設定ダイアログコンポーネント
 *
 * 呼び出し関係: AuthenticatedWorkspace から open 制御付きで使用される。
 */
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logger } from "@/lib/logger";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { useApi, useTranslation } from "@/hooks";
import type {
  AvailableLanguage,
  AvailableModel,
  TokenUsageRead,
  UserApiKey,
} from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenUsage?: TokenUsageRead | null;
}

type SettingsErrorKey = "settings.loadError" | "settings.saveError" | "common.error";
type ApiKeysErrorKey =
  | "settings.apiKeysListError"
  | "settings.apiKeysCreateError"
  | "settings.apiKeysRevokeError"
  | "common.error";

/**
 * 設定ダイアログ本体。
 * open が true になった時点で設定・API キー一覧を並列取得し、close 時に揮発性の状態（新規キー等）をリセットする。
 */
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
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([]);
  const [apiKeyName, setApiKeyName] = useState("");
  const [newApiKeySecret, setNewApiKeySecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isCreatingApiKey, setIsCreatingApiKey] = useState(false);
  const [revokingApiKeyId, setRevokingApiKeyId] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorKey, setErrorKey] = useState<SettingsErrorKey | null>(null);
  const [apiKeysErrorKey, setApiKeysErrorKey] = useState<ApiKeysErrorKey | null>(
    null
  );

  useEffect(() => {
    let isMounted = true;

    async function loadApiKeys(apiClient: Awaited<ReturnType<typeof getApi>>) {
      setIsApiKeysLoading(true);
      setApiKeysErrorKey(null);

      try {
        const userApiKeys = await apiClient.listApiKeys();
        if (!isMounted) return;

        logger.debug("Settings API keys response received", {
          api_key_count: userApiKeys.length,
        });
        setApiKeys(userApiKeys);
      } catch (err) {
        if (!isMounted) return;

        logger.error("Failed to load API keys", err);
        setApiKeysErrorKey("settings.apiKeysListError");
      } finally {
        if (isMounted) {
          setIsApiKeysLoading(false);
        }
      }
    }

    async function loadSettings() {
      if (!open) return;
      setIsLoading(true);
      setErrorKey(null);
      setApiKeysErrorKey(null);
      setSaveSuccess(false);

      try {
        const apiClient = await getApi();
        const response = await apiClient.getSettings();
        if (!isMounted) return;

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

        setIsLoading(false);
        void loadApiKeys(apiClient);
      } catch (err) {
        if (!isMounted) return;

        logger.error("Failed to load settings", err);
        setErrorKey("settings.loadError");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, [open, getApi]);

  useEffect(() => {
    if (open) return;

    setApiKeyName("");
    setNewApiKeySecret(null);
    setSecretCopied(false);
    setErrorKey(null);
    setApiKeysErrorKey(null);
    setSaveSuccess(false);
  }, [open]);

  const handleSave = async () => {
    setIsSaving(true);
    setErrorKey(null);
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
      setErrorKey("settings.saveError");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setErrorKey(null);
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
      setErrorKey("common.error");
    } finally {
      setIsExporting(false);
    }
  };

  /**
   * API キーを新規発行するハンドラ。
   * 発行直後に平文トークンを newApiKeySecret に保持し、一度だけクリップボードコピーできるようにする。
   * この平文は再取得不可なためダイアログを閉じるとリセットされる。
   */
  const handleCreateApiKey = async () => {
    const trimmedName = apiKeyName.trim();
    if (!trimmedName) {
      return;
    }

    setIsCreatingApiKey(true);
    setApiKeysErrorKey(null);
    setSecretCopied(false);

    try {
      const apiClient = await getApi();
      const response = await apiClient.createApiKey({ name: trimmedName });
      setApiKeys((prev) => [response.api_key, ...prev]);
      setApiKeyName("");
      setNewApiKeySecret(response.token_plain);
    } catch (err) {
      logger.error("Failed to create API key", err);
      setApiKeysErrorKey("settings.apiKeysCreateError");
    } finally {
      setIsCreatingApiKey(false);
    }
  };

  const handleCopyApiKey = async () => {
    if (!newApiKeySecret) {
      return;
    }

    try {
      await navigator.clipboard.writeText(newApiKeySecret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch (err) {
      logger.error("Failed to copy API key", err);
      setApiKeysErrorKey("common.error");
    }
  };

  const handleRevokeApiKey = async (keyId: string) => {
    if (!confirm(t("settings.apiKeysRevokeConfirm"))) {
      return;
    }

    setRevokingApiKeyId(keyId);
    setApiKeysErrorKey(null);

    try {
      const apiClient = await getApi();
      await apiClient.revokeApiKey(keyId);
      setApiKeys((prev) => prev.filter((key) => key.id !== keyId));
    } catch (err) {
      logger.error("Failed to revoke API key", err);
      setApiKeysErrorKey("settings.apiKeysRevokeError");
    } finally {
      setRevokingApiKeyId(null);
    }
  };

  const formatLastUsed = (value: string | null) => {
    if (!value) {
      return t("settings.apiKeysNeverUsed");
    }

    return new Date(value).toLocaleString();
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
        ) : errorKey ? (
          <div className="py-4 text-sm text-red-500">{t(errorKey)}</div>
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
                    {t("settings.apiKeysTitle")}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.apiKeysDescription")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="api-key-name">{t("settings.apiKeysNameLabel")}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="api-key-name"
                      value={apiKeyName}
                      onChange={(event) => setApiKeyName(event.target.value)}
                      placeholder={t("settings.apiKeysNamePlaceholder")}
                    />
                    <Button
                      onClick={handleCreateApiKey}
                      disabled={isCreatingApiKey || apiKeyName.trim().length === 0}
                    >
                      {isCreatingApiKey ? (
                        <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {t("settings.apiKeysCreateButton")}
                    </Button>
                  </div>
                </div>

                {apiKeysErrorKey ? (
                  <p className="text-sm text-red-500">{t(apiKeysErrorKey)}</p>
                ) : null}

                {newApiKeySecret ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {t("settings.apiKeysCreatedTitle")}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("settings.apiKeysCreatedDescription")}
                      </p>
                    </div>
                    <code className="block overflow-x-auto rounded bg-muted px-3 py-2 text-sm">
                      {newApiKeySecret}
                    </code>
                    <Button variant="outline" onClick={handleCopyApiKey}>
                      {secretCopied ? t("common.copied") : t("common.copy")}
                    </Button>
                  </div>
                ) : null}

                <div className="space-y-2">
                  {isApiKeysLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                      <span>{t("common.loading")}</span>
                    </div>
                  ) : apiKeys.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("settings.apiKeysEmpty")}
                    </p>
                  ) : (
                    apiKeys.map((key) => (
                      <div
                        key={key.id}
                        data-testid={`api-key-row-${key.id}`}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{key.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {key.token_prefix}...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t("settings.apiKeysLastUsed")}: {formatLastUsed(key.last_used_at)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => handleRevokeApiKey(key.id)}
                          disabled={revokingApiKeyId === key.id}
                        >
                          {revokingApiKeyId === key.id ? (
                            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {t("settings.apiKeysRevokeButton")}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

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
