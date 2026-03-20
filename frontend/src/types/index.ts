// Folder types
export interface Folder {
  id: string;
  name: string;
  user_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FolderCreate {
  name: string;
}

export interface FolderUpdate {
  name?: string;
}

export interface MCPTokenCreateRequest {
  name: string;
  expires_in_days: 30 | 60 | 90 | 365 | null;
}

export interface MCPTokenResponse {
  id: string;
  name: string;
  token: string;
  created_at: string;
  expires_at: string | null;
  expires_in: number;
  expires_in_days: number | null;
}

export interface MCPTokenListItem {
  id: string;
  name: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  is_active: boolean;
  last_used_at: string | null;
  expires_in_days: number | null;
}

export interface MCPTokensListResponse {
  tokens: MCPTokenListItem[];
}

// Token usage types
export interface Note {
  id: string;
  title: string;
  content: string;
  user_id: string;
  folder_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NoteCreate {
  title?: string;
  content?: string;
  folder_id?: string | null;
}

export interface NoteUpdate {
  title?: string;
  content?: string;
  folder_id?: string | null;
}

export interface WorkspaceSnapshotResponse {
  folders: Folder[];
  notes: Note[];
  cursor: string;
  server_time: string;
}

export type WorkspaceEntityType = "folder" | "note";
export type WorkspaceOperationType = "create" | "update" | "delete";

export interface WorkspaceChangeRequest {
  entity: WorkspaceEntityType;
  operation: WorkspaceOperationType;
  entity_id?: string;
  client_mutation_id?: string;
  expected_version?: number;
  payload?: Record<string, unknown>;
}

export interface WorkspaceChangesRequest {
  device_id?: string;
  base_cursor?: string;
  changes: WorkspaceChangeRequest[];
}

export interface WorkspaceAppliedChange {
  entity: WorkspaceEntityType;
  operation: WorkspaceOperationType;
  entity_id: string;
  client_mutation_id: string | null;
  folder: Folder | null;
  note: Note | null;
}

export interface WorkspaceChangesResponse {
  applied: WorkspaceAppliedChange[];
  snapshot: WorkspaceSnapshotResponse;
}

// AI types
export interface SummarizeRequest {
  note_id: string;
}

export interface SummarizeResponse {
  summary: string;
  tokens_used: number;
}

export interface EditProposal {
  originalContent: string;
  editedContent: string;
  status?: "pending" | "accepted" | "rejected";
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  editProposal?: EditProposal;
}

export interface ChatRequest {
  scope?: "note" | "folder" | "all";
  note_id?: string;
  folder_id?: string;
  question: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  answer: string;
  tokens_used: number;
}

export interface EditRequest {
  content: string;
  instruction: string;
  note_id?: string;
}

export interface EditResponse {
  edited_content: string;
  tokens_used: number;
}

export interface EditJobRequest {
  content: string;
  instruction: string;
  note_id?: string;
}

export interface EditJob {
  id: string;
  note_id: string | null;
  status: "pending" | "running" | "completed" | "failed";
  edited_content: string | null;
  error_message: string | null;
  tokens_used: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface EditJobCreateResponse {
  job: EditJob;
}

// Settings types
export interface UserSettings {
  user_id: string;
  llm_model_id: string;
  language: string;
  token_limit: number;
  created_at: string;
  updated_at: string;
}

export interface AvailableModel {
  id: string;
  name: string;
  description: string;
}

export interface AvailableLanguage {
  id: string;
  name: string;
  description: string;
}

export interface TokenUsageRead {
  tokens_used: number;
  token_limit: number;
  period_start: string;
  period_end: string;
}

export interface SettingsResponse {
  settings: UserSettings;
  available_models: AvailableModel[];
  available_languages: AvailableLanguage[];
  token_usage: TokenUsageRead;
}

export interface UserSettingsUpdate {
  llm_model_id?: string;
  language?: string;
}

export interface AppUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
  admin: boolean;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

export interface AdminUserSummary {
  user: AppUser;
  settings: UserSettings;
  token_usage: TokenUsageRead;
  note_count: number;
  folder_count: number;
  mcp_token_count: number;
}

export interface AdminUsersListResponse {
  users: AdminUserSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUserDetailResponse extends AdminUserSummary {
  available_models: AvailableModel[];
  available_languages: AvailableLanguage[];
}

export interface AdminUserUpdateRequest {
  admin?: boolean;
  llm_model_id?: string;
  language?: string;
  token_limit?: number;
}

// Share types
export interface NoteShare {
  id: string;
  note_id: string;
  share_token: string;
  created_at: string;
  expires_at: string | null;
}

export interface SharedNote {
  title: string;
  content: string;
  updated_at: string;
}

// MCP Token Management types
export interface MCPTokenInfo {
  token: string;
  expiresAt: Date;
  expires_in: number;
}

export interface MCPTokenRequest {
  url: string;
  token: string;
  expires_in: number;
}

export interface MCPSettingsResponse {
  server_url: string;
  token_expires_in: number;
  token_expiration_options: number[];
}
