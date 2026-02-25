import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsDialog } from "./SettingsDialog";
import { AuthProvider } from "@/lib/auth-context";

// Mock api.ts
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

// Mock useTranslation
vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "common.save": "Save",
        "common.cancel": "Cancel",
        "common.error": "Error",
        "common.loading": "Loading...",
        "common.copy": "Copy",
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
        "settings.exportTitle": "Data Export",
        "settings.exportDescription": "Export all notes",
        "settings.exportButton": "Download ZIP",
        "settings.supportTitle": "Support Developer",
        "settings.supportDescription": "Support on Ko-fi",
        "settings.mcpSection": "MCP API Keys",
        "settings.mcpDescription": "Manage API keys",
        "settings.mcpNoTokens": "No API keys",
        "settings.mcpCreateToken": "Create API Key",
        "settings.mcpMaxTokensReached": "Maximum 2 active API keys allowed",
        "settings.mcpTokenActive": "Active",
        "settings.mcpTokenRevoked": "Revoked",
        "settings.mcpTokenExpires": "Expires at",
        "settings.mcpRevokeToken": "Revoke",
        "settings.mcpDeleteToken": "Delete",
        "settings.mcpDeleteConfirm": "Delete this API key? This action cannot be undone.",
        "settings.createApiKey": "Create API Key",
        "settings.createApiKeyDescription": "Create a new API key",
        "settings.apiKeyNameRequired": "Purpose is required",
        "settings.apiKeyName": "Purpose",
        "settings.apiKeyNamePlaceholder": "e.g., VSCode, Inspector",
        "settings.apiKey": "API Key",
        "settings.apiKeyCreated": "API key created",
        "settings.apiKeyWarning": "This API key will only be shown once.",
        "tokenUsage.title": "Token Usage",
      };
      return translations[key] || key;
    },
  }),
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

// Mock window.confirm
const mockConfirm = vi.fn();
window.confirm = mockConfirm;

describe("SettingsDialog", () => {
  const mockApi = {
    getSettings: vi.fn().mockResolvedValue({
      settings: {
        user_id: "test-user",
        llm_model_id: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        language: "auto",
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
    exportNotes: vi.fn().mockResolvedValue(new Blob()),
    listMcpTokens: vi.fn(),
    createMcpToken: vi.fn(),
    revokeMcpToken: vi.fn(),
    deleteMcpToken: vi.fn(),
  };

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    tokenUsage: {
      tokens_used: 1000,
      token_limit: 10000,
      period_end: new Date(Date.now() + 86400000).toISOString(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockConfirm.mockReturnValue(true);
    // Update the mock to return mockApi when createApiClient is called
    const { createApiClient } = await import("@/lib/api");
    vi.mocked(createApiClient).mockReturnValue(mockApi as unknown);
  });

  const renderWithAuth = (ui: React.ReactNode) => {
    return render(
      <AuthProvider>
        {ui}
      </AuthProvider>
    );
  };

  describe("MCP API Keys Section", () => {
    it("shows 'No API keys' message when there are no tokens", async () => {
      mockApi.listMcpTokens.mockResolvedValue({ tokens: [] });

      renderWithAuth(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("No API keys")).toBeInTheDocument();
      });
    });

    it("displays API keys in list", async () => {
      const mockTokens = [
        {
          id: "token-1",
          name: "VSCode",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          revoked_at: null,
          is_active: true,
        },
      ];
      mockApi.listMcpTokens.mockResolvedValue({ tokens: mockTokens });

      renderWithAuth(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("VSCode")).toBeInTheDocument();
        expect(screen.getByText("Active")).toBeInTheDocument();
      });
    });

    it("shows create button when fewer than 2 active tokens", async () => {
      const mockTokens = [
        {
          id: "token-1",
          name: "Token 1",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          revoked_at: null,
          is_active: true,
        },
      ];
      mockApi.listMcpTokens.mockResolvedValue({ tokens: mockTokens });

      renderWithAuth(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Create API Key")).toBeInTheDocument();
      });
    });

    it("shows max reached message when 2 active tokens exist", async () => {
      const mockTokens = [
        {
          id: "token-1",
          name: "Token 1",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          revoked_at: null,
          is_active: true,
        },
        {
          id: "token-2",
          name: "Token 2",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          revoked_at: null,
          is_active: true,
        },
      ];
      mockApi.listMcpTokens.mockResolvedValue({ tokens: mockTokens });

      renderWithAuth(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Maximum 2 active API keys allowed")).toBeInTheDocument();
      });
    });
  });

  describe("MCP Token Deletion", () => {
    it("shows delete confirmation dialog when delete button is clicked", async () => {
      const mockTokens = [
        {
          id: "token-1",
          name: "Test Token",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          revoked_at: null,
          is_active: true,
        },
      ];
      mockApi.listMcpTokens.mockResolvedValue({ tokens: mockTokens });

      renderWithAuth(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        const deleteButton = screen.getAllByText("Delete").find(
          btn => btn.textContent === "Delete"
        );
        fireEvent.click(deleteButton);
      });

      expect(mockConfirm).toHaveBeenCalledWith(
        "Delete this API key? This action cannot be undone."
      );
    });

    it("does not delete when confirmation is cancelled", async () => {
      mockConfirm.mockReturnValue(false);
      const mockTokens = [
        {
          id: "token-1",
          name: "Test Token",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          revoked_at: null,
          is_active: true,
        },
      ];
      mockApi.listMcpTokens.mockResolvedValue({ tokens: mockTokens });

      renderWithAuth(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        const deleteButton = screen.getAllByText("Delete").find(
          btn => btn.textContent === "Delete"
        );
        fireEvent.click(deleteButton);
      });

      expect(mockConfirm).toHaveBeenCalled();
      expect(mockApi.deleteMcpToken).not.toHaveBeenCalled();
    });

    it("deletes token when confirmation is accepted", async () => {
      mockConfirm.mockReturnValue(true);
      const mockTokens = [
        {
          id: "token-1",
          name: "Test Token",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
          revoked_at: null,
          is_active: true,
        },
      ];
      mockApi.listMcpTokens.mockResolvedValue({ tokens: mockTokens });
      mockApi.deleteMcpToken.mockResolvedValue({});

      renderWithAuth(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        const deleteButton = screen.getAllByText("Delete").find(
          btn => btn.textContent === "Delete"
        );
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(mockApi.deleteMcpToken).toHaveBeenCalledWith("token-1");
      });
    });
  });

  describe("Dialog Structure", () => {
    it("renders dialog title and description", async () => {
      renderWithAuth(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Settings")).toBeInTheDocument();
        expect(screen.getByText("Manage your settings")).toBeInTheDocument();
      });
    });

    it("has save and cancel buttons", async () => {
      renderWithAuth(<SettingsDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText("Save")).toBeInTheDocument();
        expect(screen.getByText("Cancel")).toBeInTheDocument();
      });
    });
  });
});
