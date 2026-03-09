// Folder types
export interface Folder {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  updated_at: string;
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

// Settings types
export interface UserSettings {
  user_id: string;
  llm_model_id: string;
  language: string;
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
