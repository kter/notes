/**
 * バックエンド REST API へのアクセスを担うクライアントモジュール。
 * 認証付きリクエストを統一的に処理し、エラーを ApiError として正規化する。
 *
 * 主なエクスポート:
 * - ApiError: HTTP エラーをラップするカスタムエラークラス
 * - ApiClient: トークンを保持し各エンドポイントを呼び出すクラス（createApiClient で生成）
 * - createApiClient: ApiClient のファクトリ関数
 * - getSharedNote: 認証不要の共有ノート取得関数
 *
 * 呼び出し関係: useApi フックから createApiClient を通じてインスタンス化され、
 * 各コンポーネントおよび syncQueue / workspaceSync から利用される。
 */
import type {
  ChatRequest,
  ChatResponse,
  EditJob,
  EditJobCreateResponse,
  EditJobRequest,
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
  UserApiKey,
  UserApiKeyCreate,
  UserApiKeyCreateResponse,
  AppUser,
  AdminUserDetailResponse,
  AdminUsersListResponse,
  AdminUserUpdateRequest,
  WorkspaceChangesRequest,
  WorkspaceChangesResponse,
  WorkspaceSnapshotResponse,
} from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * HTTP エラーレスポンスをラップするカスタムエラークラス。
 * status / statusText / data を保持し、呼び出し元での分岐処理を容易にする。
 */
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

/**
 * 認証トークンを保持し、バックエンドの各 REST エンドポイントを呼び出すクラス。
 * 外部から直接 new せず createApiClient ファクトリ経由で生成する。
 */
class ApiClient {
  constructor(private readonly token: string | null = null) { }

  /**
   * 共通の fetch ラッパー。Authorization ヘッダー付与・エラー正規化・204 対応を行う。
   */
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
        // JSON パースに失敗した場合はテキスト、それも失敗したら空オブジェクトにフォールバック
        try {
          errorData = await response.text();
        } catch {
          errorData = {};
        }
      }
      throw new ApiError(response.status, response.statusText, errorData);
    }

    if (response.status === 204) {
      // 204 No Content はボディなしのため undefined を返す
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

  // Workspace Sync API
  async getWorkspaceSnapshot(): Promise<WorkspaceSnapshotResponse> {
    return this.request<WorkspaceSnapshotResponse>("/api/workspace/snapshot");
  }

  async applyWorkspaceChanges(
    data: WorkspaceChangesRequest
  ): Promise<WorkspaceChangesResponse> {
    return this.request<WorkspaceChangesResponse>("/api/workspace/changes", {
      method: "POST",
      body: JSON.stringify(data),
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

  async createEditJob(data: EditJobRequest): Promise<EditJobCreateResponse> {
    return this.request<EditJobCreateResponse>("/api/ai/edit-jobs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getEditJob(jobId: string): Promise<EditJob> {
    return this.request<EditJob>(`/api/ai/edit-jobs/${jobId}`);
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

  async listApiKeys(): Promise<UserApiKey[]> {
    return this.request<UserApiKey[]>("/api/settings/api-keys");
  }

  async createApiKey(data: UserApiKeyCreate): Promise<UserApiKeyCreateResponse> {
    return this.request<UserApiKeyCreateResponse>("/api/settings/api-keys", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async revokeApiKey(keyId: string): Promise<void> {
    return this.request<void>(`/api/settings/api-keys/${keyId}`, {
      method: "DELETE",
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

/**
 * 認証トークンを受け取り ApiClient インスタンスを生成するファクトリ関数。
 * token が null の場合は認証ヘッダーなしでリクエストを送る。
 */
export function createApiClient(token: string | null): ApiClient {
  return new ApiClient(token);
}

/**
 * 共有トークンを使って公開ノートを取得する。認証不要のパブリックエンドポイント。
 */
export async function getSharedNote(token: string): Promise<SharedNote> {
  const response = await fetch(`${API_BASE_URL}/api/shared/${token}`);

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText, await response.json().catch(() => ({})));
  }

  return response.json();
}
