import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth-context";
import { SettingsDialog } from "./SettingsDialog";

vi.mock("@/lib/api", () => ({
  ApiError: class extends Error {
    constructor(status: number, statusText: string, data: unknown) {
      super(statusText);
      this.status = status;
      this.statusText = statusText;
      this.data = data;
    }
    status: number;
    statusText: string;
    data: unknown;
  },
  createApiClient: vi.fn(() => ({})),
  getSharedNote: vi.fn(),
}));

const mockT = vi.fn((key: string) => {
  const translations: Record<string, string> = {
    "common.save": "Save",
    "common.saved": "Saved",
    "common.cancel": "Cancel",
    "common.error": "Error",
    "settings.title": "Settings",
    "settings.description": "Manage your settings",
    "settings.aiModel": "AI Model",
    "settings.aiModelDescription": "Select the AI model",
    "settings.selectModel": "Select model",
    "settings.language": "Language",
    "settings.languageDescription": "Set language",
    "settings.selectLanguage": "Select language",
    "settings.loadError": "Failed to load settings",
    "settings.saveError": "Failed to save settings",
    "settings.apiKeysTitle": "API Keys",
    "settings.apiKeysDescription": "Create API keys for external folder and note clients.",
    "settings.apiKeysEmpty": "No API keys yet.",
    "settings.apiKeysNameLabel": "Key name",
    "settings.apiKeysNamePlaceholder": "External client",
    "settings.apiKeysCreateButton": "Create API key",
    "settings.apiKeysCreateError": "Failed to create API key",
    "settings.apiKeysListError": "Failed to load API keys",
    "settings.apiKeysRevokeButton": "Revoke",
    "settings.apiKeysRevokeConfirm": "Revoke this API key?",
    "settings.apiKeysRevokeError": "Failed to revoke API key",
    "settings.apiKeysCreatedTitle": "New API key",
    "settings.apiKeysCreatedDescription": "Copy this secret now. It will only be shown once.",
    "settings.apiKeysLastUsed": "Last used",
    "settings.apiKeysNeverUsed": "Never used",
    "settings.exportTitle": "Data Export",
    "settings.exportDescription": "Export all notes",
    "settings.exportButton": "Download ZIP",
    "settings.supportTitle": "Support Developer",
    "settings.supportDescription": "Support on Ko-fi",
    "tokenUsage.title": "Token Usage",
    "tokenUsage.used": "used",
    "tokenUsage.resetDate": "Reset date",
  };
  return translations[key] || key;
});

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: mockT,
    language: "en",
    setLanguage: vi.fn(),
  }),
}));

const createObjectURLMock = vi.fn(() => "blob:test");
const revokeObjectURLMock = vi.fn();

describe("SettingsDialog", () => {
  const mockApi = {
    getSettings: vi.fn().mockResolvedValue({
      settings: {
        user_id: "test-user",
        llm_model_id: "model-1",
        language: "auto",
        token_limit: 10000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      available_models: [
        { id: "model-1", name: "Model 1", description: "Description 1" },
        { id: "model-2", name: "Model 2", description: "Description 2" },
      ],
      available_languages: [
        { id: "auto", name: "Auto", description: "Browser settings" },
        { id: "ja", name: "Japanese", description: "Japanese" },
        { id: "en", name: "English", description: "English" },
      ],
    }),
    updateSettings: vi.fn().mockResolvedValue({}),
    listApiKeys: vi.fn().mockResolvedValue([]),
    createApiKey: vi.fn().mockResolvedValue({
      api_key: {
        id: "key-1",
        user_id: "test-user",
        name: "External client",
        token_prefix: "notes_test_secret",
        created_at: new Date().toISOString(),
        last_used_at: null,
        revoked_at: null,
      },
      token_plain: "notes_test_secret_value",
    }),
    revokeApiKey: vi.fn().mockResolvedValue(undefined),
    exportNotes: vi.fn().mockResolvedValue(new Blob()),
  };

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    tokenUsage: {
      tokens_used: 1000,
      token_limit: 10000,
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 86400000).toISOString(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;
    vi.stubGlobal("confirm", vi.fn(() => true));
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    const { createApiClient } = await import("@/lib/api");
    vi.mocked(createApiClient).mockReturnValue(
      mockApi as unknown as ReturnType<typeof createApiClient>
    );
  });

  const renderWithAuth = (ui: React.ReactNode) =>
    render(<AuthProvider>{ui}</AuthProvider>);

  it("renders dialog title and action buttons", async () => {
    renderWithAuth(<SettingsDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Settings")).toBeInTheDocument();
      expect(screen.getByText("Manage your settings")).toBeInTheDocument();
      expect(screen.getByText("Save")).toBeInTheDocument();
      expect(screen.getByText("Cancel")).toBeInTheDocument();
    });
  });

  it("loads settings and renders the export section", async () => {
    renderWithAuth(<SettingsDialog {...defaultProps} />);

    await waitFor(() => {
      expect(mockApi.getSettings).toHaveBeenCalled();
      expect(mockApi.listApiKeys).toHaveBeenCalled();
      expect(screen.getByText("API Keys")).toBeInTheDocument();
      expect(screen.getByText("Data Export")).toBeInTheDocument();
    });
  });

  it("creates an API key and shows the secret once", async () => {
    renderWithAuth(<SettingsDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Create API key")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText("Key name"), {
      target: { value: "External client" },
    });
    fireEvent.click(screen.getByText("Create API key"));

    await waitFor(() => {
      expect(mockApi.createApiKey).toHaveBeenCalledWith({ name: "External client" });
      expect(screen.getByText("New API key")).toBeInTheDocument();
      expect(screen.getByText("notes_test_secret_value")).toBeInTheDocument();
    });
  });

  it("revokes an existing API key", async () => {
    mockApi.listApiKeys.mockResolvedValueOnce([
      {
        id: "key-1",
        user_id: "test-user",
        name: "Existing key",
        token_prefix: "notes_existing",
        created_at: new Date().toISOString(),
        last_used_at: null,
        revoked_at: null,
      },
    ]);

    renderWithAuth(<SettingsDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Existing key")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Revoke"));

    await waitFor(() => {
      expect(mockApi.revokeApiKey).toHaveBeenCalledWith("key-1");
      expect(screen.queryByText("Existing key")).not.toBeInTheDocument();
    });
  });

  it("calls exportNotes when export button is clicked", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => {}
    );

    renderWithAuth(<SettingsDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Download ZIP")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Download ZIP"));

    await waitFor(() => {
      expect(mockApi.exportNotes).toHaveBeenCalled();
      expect(createObjectURLMock).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalled();
    });

    clickSpy.mockRestore();
  });
});
