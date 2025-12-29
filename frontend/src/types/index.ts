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

// Note types
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
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  note_id: string;
  question: string;
  history?: ChatMessage[];
}

export interface ChatResponse {
  answer: string;
}

export interface GenerateTitleRequest {
  note_id: string;
}

export interface GenerateTitleResponse {
  title: string;
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

export interface SettingsResponse {
  settings: UserSettings;
  available_models: AvailableModel[];
  available_languages: AvailableLanguage[];
}

export interface UserSettingsUpdate {
  llm_model_id?: string;
  language?: string;
}
