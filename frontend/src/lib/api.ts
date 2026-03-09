import type {
  ChatRequest,
  ChatResponse,
  EditRequest,
  EditResponse,
  Folder,
  FolderCreate,
  FolderUpdate,

  Note,
  NoteCreate,
  NoteShare,
  NoteUpdate,
  SettingsResponse,
  SharedNote,
  SummarizeRequest,
  SummarizeResponse,
  UserSettingsUpdate,
  MCPTokenCreateRequest,
  MCPTokenResponse,
  MCPTokensListResponse,
  MCPSettingsResponse,
  AppUser,
  AdminUserDetailResponse,
  AdminUsersListResponse,
  AdminUserUpdateRequest,
} from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data: unknown
  ) {
    super(`API error: ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

class ApiClient {
  constructor(private readonly token: string | null = null) { }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        // If parsing JSON fails, try to get text or fallback to empty object
        try {
          errorData = await response.text();
        } catch {
          errorData = {};
        }
      }
      throw new ApiError(response.status, response.statusText, errorData);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Folders API
  async listFolders(): Promise<Folder[]> {
    return this.request<Folder[]>("/api/folders");
  }

  async createFolder(data: FolderCreate): Promise<Folder> {
    return this.request<Folder>("/api/folders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getFolder(id: string): Promise<Folder> {
    return this.request<Folder>(`/api/folders/${id}`);
  }

  async updateFolder(id: string, data: FolderUpdate): Promise<Folder> {
    return this.request<Folder>(`/api/folders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteFolder(id: string): Promise<void> {
    return this.request<void>(`/api/folders/${id}`, {
      method: "DELETE",
    });
  }

  // Notes API
  async listNotes(folderId?: string): Promise<Note[]> {
    const query = folderId ? `?folder_id=${folderId}` : "";
    return this.request<Note[]>(`/api/notes${query}`);
  }

  async createNote(data: NoteCreate): Promise<Note> {
    return this.request<Note>("/api/notes", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getNote(id: string): Promise<Note> {
    return this.request<Note>(`/api/notes/${id}`);
  }

  async updateNote(id: string, data: NoteUpdate): Promise<Note> {
    return this.request<Note>(`/api/notes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteNote(id: string): Promise<void> {
    return this.request<void>(`/api/notes/${id}`, {
      method: "DELETE",
    });
  }

  // AI API
  async summarizeNote(data: SummarizeRequest): Promise<SummarizeResponse> {
    return this.request<SummarizeResponse>("/api/ai/summarize", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async chatWithNote(data: ChatRequest): Promise<ChatResponse> {
    return this.request<ChatResponse>("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async editNoteContent(data: EditRequest): Promise<EditResponse> {
    return this.request<EditResponse>("/api/ai/edit", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }



  // Settings API
  async getSettings(): Promise<SettingsResponse> {
    return this.request<SettingsResponse>("/api/settings");
  }

  async updateSettings(data: UserSettingsUpdate): Promise<SettingsResponse> {
    return this.request<SettingsResponse>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Admin API
  async getAdminMe(): Promise<AppUser> {
    return this.request<AppUser>("/api/admin/me");
  }

  async listAdminUsers(params: {
    q?: string;
    admin_only?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<AdminUsersListResponse> {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (typeof params.admin_only === "boolean") {
      search.set("admin_only", String(params.admin_only));
    }
    if (typeof params.limit === "number") search.set("limit", String(params.limit));
    if (typeof params.offset === "number") search.set("offset", String(params.offset));

    const query = search.toString();
    return this.request<AdminUsersListResponse>(`/api/admin/users${query ? `?${query}` : ""}`);
  }

  async getAdminUser(userId: string): Promise<AdminUserDetailResponse> {
    return this.request<AdminUserDetailResponse>(`/api/admin/users/${userId}`);
  }

  async updateAdminUser(userId: string, data: AdminUserUpdateRequest): Promise<AdminUserDetailResponse> {
    return this.request<AdminUserDetailResponse>(`/api/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // MCP Token Management API
  async createMcpToken(data: MCPTokenCreateRequest): Promise<MCPTokenResponse> {
    return this.request<MCPTokenResponse>("/api/mcp/tokens", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listMcpTokens(): Promise<MCPTokensListResponse> {
    return this.request<MCPTokensListResponse>("/api/mcp/tokens");
  }

  async getMcpSettings(): Promise<MCPSettingsResponse> {
    return this.request<MCPSettingsResponse>("/api/mcp/settings");
  }

  async revokeMcpToken(tokenId: string): Promise<void> {
    return this.request<void>(`/api/mcp/tokens/${tokenId}/revoke`, {
      method: "POST",
    });
  }

  async deleteMcpToken(tokenId: string): Promise<void> {
    return this.request<void>(`/api/mcp/tokens/${tokenId}`, {
      method: "DELETE",
    });
  }

  async restoreMcpToken(tokenId: string): Promise<void> {
    return this.request<void>(`/api/mcp/tokens/${tokenId}/restore`, {
      method: "POST",
    });
  }

  async uploadImage(file: File): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/images`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = {};
      }
      throw new ApiError(response.status, response.statusText, errorData);
    }

    return response.json();
  }

  async exportNotes(): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/api/notes/export/all`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new ApiError(response.status, response.statusText, await response.text());
    }

    return response.blob();
  }

  // Share API
  async createNoteShare(noteId: string): Promise<NoteShare> {
    return this.request<NoteShare>(`/api/notes/${noteId}/share`, {
      method: "POST",
    });
  }

  async getNoteShare(noteId: string): Promise<NoteShare | null> {
    return this.request<NoteShare | null>(`/api/notes/${noteId}/share`);
  }

  async deleteNoteShare(noteId: string): Promise<void> {
    return this.request<void>(`/api/notes/${noteId}/share`, {
      method: "DELETE",
    });
  }
}

export function createApiClient(token: string | null): ApiClient {
  return new ApiClient(token);
}

// Public API (no auth required)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function getSharedNote(token: string): Promise<SharedNote> {
  const response = await fetch(`${API_BASE}/api/shared/${token}`);

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText, await response.json().catch(() => ({})));
  }

  return response.json();
}
