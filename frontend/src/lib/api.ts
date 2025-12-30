import type {
  ChatRequest,
  ChatResponse,
  Folder,
  FolderCreate,
  FolderUpdate,
  GenerateTitleRequest,
  GenerateTitleResponse,
  Note,
  NoteCreate,
  NoteUpdate,
  SettingsResponse,
  SummarizeRequest,
  SummarizeResponse,
  UserSettings,
  UserSettingsUpdate,
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
  constructor(private readonly token: string | null = null) {}

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

  async generateTitle(data: GenerateTitleRequest): Promise<GenerateTitleResponse> {
    return this.request<GenerateTitleResponse>("/api/ai/generate-title", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Settings API
  async getSettings(): Promise<SettingsResponse> {
    return this.request<SettingsResponse>("/api/settings");
  }

  async updateSettings(data: UserSettingsUpdate): Promise<UserSettings> {
    return this.request<UserSettings>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
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
}

export function createApiClient(token: string | null): ApiClient {
  return new ApiClient(token);
}

