import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Loader2Icon, CheckIcon, Trash2Icon, RefreshCwIcon, KeyIcon } from "lucide-react";
import { useApi, useTranslation } from "@/hooks";
import type { AvailableModel, AvailableLanguage, TokenUsageRead, MCPTokenListItem, MCPSettingsResponse } from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenUsage?: TokenUsageRead | null;
}

interface NewTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenCreated: () => void;
}

function NewTokenDialog({ open, onOpenChange, onTokenCreated }: NewTokenDialogProps) {
  const { t } = useTranslation();
  const { getApi } = useApi();
  const [tokenName, setTokenName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<30 | 60 | 90 | 365 | null>(365);
  const [isCreating, setIsCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<{ id: string; name: string; token: string; expires_at: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const handleCreateToken = async () => {
    if (!tokenName.trim()) {
      setError(t("settings.apiKeyNameRequired"));
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const apiClient = await getApi();
      const response = await apiClient.createMcpToken({ name: tokenName, expires_in_days: expiresInDays });
      setCreatedToken({
        id: response.id,
        name: response.name,
        token: response.token,
        expires_at: response.expires_at,
      });
      onTokenCreated();
    } catch (err) {
      console.error("Failed to create API key:", err);
      const errorMsg = err instanceof Error ? err.message : t("common.error");
      setError(errorMsg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setTokenName("");
    setExpiresInDays(365);
    setCreatedToken(null);
    setError(null);
    setIsCopied(false);
    onOpenChange(false);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(createdToken.token);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("settings.createApiKey")}</DialogTitle>
          <DialogDescription>
            {t("settings.createApiKeyDescription")}
          </DialogDescription>
        </DialogHeader>

        {!createdToken ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="token-name">{t("settings.apiKeyName")}</Label>
              <Input
                id="token-name"
                placeholder={t("settings.apiKeyNamePlaceholder")}
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                disabled={isCreating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token-expiration">{t("settings.mcpTokenExpiration")}</Label>
              <Select
                value={expiresInDays?.toString()}
                onValueChange={(value) => setExpiresInDays(value === "null" ? null : parseInt(value) as any)}
              >
                <SelectTrigger id="token-expiration">
                  <SelectValue placeholder={t("settings.mcpSelectExpiration")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 {t("common.days")}</SelectItem>
                  <SelectItem value="60">60 {t("common.days")}</SelectItem>
                  <SelectItem value="90">90 {t("common.days")}</SelectItem>
                  <SelectItem value="365">1 {t("common.year")}</SelectItem>
                  <SelectItem value="null">{t("settings.mcpNoExpiration")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("settings.mcpExpirationNote")}
              </p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button
              onClick={handleCreateToken}
              disabled={isCreating}
              className="w-full"
            >
              {isCreating ? (
                <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
              ) : t("settings.createApiKey")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("settings.apiKeyCreated")}</Label>
              <p className="text-sm text-muted-foreground">
                {t("settings.apiKeyWarning")}
              </p>
            </div>
            <div className="rounded-md bg-secondary p-4 space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">{t("settings.apiKeyName")}</Label>
                <p className="text-sm font-medium">{createdToken.name}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("settings.mcpTokenExpiration")}</Label>
                <p className="text-sm font-medium">
                  {createdToken.expires_at
                    ? new Date(createdToken.expires_at).toLocaleDateString()
                    : t("settings.mcpNoExpiration")
                  }
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("settings.apiKey")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={createdToken.token}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyToken}
                    disabled={isCopied}
                  >
                    {isCopied ? t("common.copied") : t("common.copy")}
                  </Button>
                </div>
              </div>
            </div>
            <Button
              onClick={handleClose}
              className="w-full"
            >
              {t("common.save")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
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
  const [availableLanguages, setAvailableLanguages] = useState<AvailableLanguage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MCP settings state
  const [mcpSettings, setMcpSettings] = useState<MCPSettingsResponse | null>(null);

  // MCP token management states
  const [apiKeys, setApiKeys] = useState<MCPTokenListItem[]>([]);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(false);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isNewTokenDialogOpen, setIsNewTokenDialogOpen] = useState(false);

  const loadApiKeys = async () => {
    setIsApiKeysLoading(true);
    setError(null);
    try {
      const apiClient = await getApi();
      const response = await apiClient.listMcpTokens();
      setApiKeys(response.tokens || []);
    } catch (err) {
      console.error("Failed to load API keys:", err);
      setError(t("common.error"));
    } finally {
      setIsApiKeysLoading(false);
    }
  };

  const handleRevokeOrRestoreToken = async (tokenId: string) => {
    if (token.is_revoked) {
      setIsRestoring(tokenId);
      setError(null);
      try {
        const apiClient = await getApi();
        await apiClient.restoreMcpToken(tokenId);
        await loadApiKeys();
      } catch (err) {
        console.error("Failed to restore API key:", err);
        setError(t("common.error"));
      } finally {
        setIsRestoring(null);
      }
    } else {
      setIsRevoking(tokenId);
      setError(null);
      try {
        const apiClient = await getApi();
        await apiClient.revokeMcpToken(tokenId);
        await loadApiKeys();
      } catch (err) {
        console.error("Failed to revoke API key:", err);
        setError(t("common.error"));
      } finally {
        setIsRevoking(null);
      }
    }
  };

  const handleDeleteToken = async (tokenId: string) => {
    if (!window.confirm(t("settings.mcpDeleteConfirm"))) {
      return;
    }
    setIsDeleting(tokenId);
    setError(null);
    try {
      const apiClient = await getApi();
      await apiClient.deleteMcpToken(tokenId);
      await loadApiKeys();
    } catch (err) {
      console.error("Failed to delete API key:", err);
      setError(t("common.error"));
    } finally {
      setIsDeleting(null);
    }
  };

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

        await loadApiKeys();

        // Load MCP settings
        const mcpSettingsResponse = await apiClient.getMcpSettings();
        setMcpSettings(mcpSettingsResponse);
      } catch (err) {
        console.error("Failed to load settings:", err);
        setError(t("settings.loadError"));
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [open, getApi]);

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
      // Update language context
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

  const activeTokens = apiKeys.filter(t => t.is_active);
  const canCreateMore = activeTokens.length < 2;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
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
            <div className="flex flex-col max-h-[80vh] overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-6 -mr-6 px-1">
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

                {/* Token Usage Section */}
                {tokenUsage && (
                  <div className="border-t pt-6 space-y-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium leading-none">
                        {t("tokenUsage.title")}
                      </h4>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{new Intl.NumberFormat().format(tokenUsage.tokens_used)} / {new Intl.NumberFormat().format(tokenUsage.token_limit)} {t("tokenUsage.used").split(' ')[0]}</span>
                        <span>{t("tokenUsage.resetDate")}: {new Date(tokenUsage.period_end).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                      <div style={{ width: `${Math.min(100, (tokenUsage.token_limit > 0 ? (tokenUsage.tokens_used / tokenUsage.token_limit) * 100 : 0))}%` }} />
                    </div>
                  </div>
                )}

                {/* Data Export Section */}
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

                {/* MCP API Keys Management Section */}
                <div className="border-t pt-6 space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <KeyIcon className="h-4 w-4" />
                      <h4 className="text-sm font-medium leading-none">
                        {t("settings.mcpSection")}
                      </h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.mcpDescription")}
                    </p>
                  </div>
                  {/* API Keys List */}
                  {isApiKeysLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2Icon className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : apiKeys.length === 0 ? (
                    <div className="rounded-md bg-secondary p-4 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {t("settings.mcpNoTokens")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {apiKeys.map((token) => (
                        <div key={token.id} className="rounded-md border p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {token.name}
                                </span>
                                {token.is_active ? (
                                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded-full">
                                    {t("settings.mcpTokenActive")}
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-800 rounded-full">
                                    {t("settings.mcpTokenRevoked")}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {t("settings.mcpTokenExpires")}: {
                                  token.expires_at
                                    ? new Date(token.expires_at).toLocaleDateString()
                                    : t("settings.mcpNoExpiration")
                                }
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {t("settings.mcpTokenLastUsed")}: {token.last_used_at ? new Date(token.last_used_at).toLocaleDateString() : t("settings.mcpTokenNeverUsed")}
                              </p>
                            </div>
                            <div className="flex gap-2 justify-end">
                              {token.is_active && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRevokeOrRestoreToken(token.id)}
                                  disabled={isRevoking === token.id || isDeleting === token.id || isRestoring === token.id}
                                >
                                  {isRevoking === token.id ? (
                                    <Loader2Icon className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <RefreshCwIcon className="h-3 w-3 mr-1" />
                                      {t("settings.mcpRevokeToken")}
                                    </>
                                  )}
                                </Button>
                              )}
                              {token.is_revoked && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRevokeOrRestoreToken(token.id)}
                                  disabled={isRevoking === token.id || isDeleting === token.id || isRestoring === token.id}
                                >
                                  {isRestoring === token.id ? (
                                    <Loader2Icon className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <RefreshCwIcon className="h-3 w-3 mr-1" />
                                      {t("settings.mcpRestoreKey")}
                                    </>
                                  )}
                                </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteToken(token.id)}
                                  disabled={isDeleting === token.id}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  {isDeleting === token.id ? (
                                    <Loader2Icon className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <Trash2Icon className="h-3 w-3 mr-1" />
                                      {t("settings.mcpDeleteToken")}
                                    </>
                                  )}
                                </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Create New Token Button */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setIsNewTokenDialogOpen(true)}
                    disabled={!canCreateMore || isNewTokenDialogOpen}
                  >
                    <KeyIcon className="h-4 w-4 mr-2" />
                    {canCreateMore
                      ? t("settings.mcpCreateToken")
                      : t("settings.mcpMaxTokensReached")}
                  </Button>
                </div>

                {/* MCP Server Configuration */}
                <div className="border-t pt-6 space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <KeyIcon className="h-4 w-4" />
                      <h4 className="text-sm font-medium leading-none">
                        {t("settings.mcpServerConfig")}
                      </h4>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("settings.mcpServerDescription")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mcp-server-url">{t("settings.mcpServerUrl")}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="mcp-server-url"
                        value={mcpSettings?.server_url || ""}
                        readOnly
                        className="font-mono text-xs"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigator.clipboard.writeText(mcpSettings?.server_url || "")}
                      >
                        {t("common.copy")}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Ko-fi Support Button */}
                <div className="border-t pt-6 space-y-4">
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

                {/* Cancel Button */}
                <div className="flex justify-end gap-2 pt-4 border-t mt-auto">
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      <NewTokenDialog
        open={isNewTokenDialogOpen}
        onOpenChange={setIsNewTokenDialogOpen}
        onTokenCreated={loadApiKeys}
      />
    </>
  );
}
