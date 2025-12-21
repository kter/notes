import type {
  ChatRequest,
  ChatResponse,
  Folder,
  FolderCreate,
  FolderUpdate,
  Note,
  NoteCreate,
  NoteUpdate,
  SummarizeRequest,
  SummarizeResponse,
} from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

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
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Folders API
  async listFolders(): Promise<Folder[]> {
    return this.request<Folder[]>("/api/folders/");
  }

  async createFolder(data: FolderCreate): Promise<Folder> {
    return this.request<Folder>("/api/folders/", {
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
    return this.request<Note[]>(`/api/notes/${query}`);
  }

  async createNote(data: NoteCreate): Promise<Note> {
    return this.request<Note>("/api/notes/", {
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
}

export const api = new ApiClient();
