// English translations
import type { TranslationKeys } from "./ja";

export const en: TranslationKeys = {
  // Common
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    create: "Create",
    loading: "Loading...",
    error: "Error",
    success: "Success",
    saved: "Saved",
  },

  // Settings
  settings: {
    title: "Settings",
    description: "Manage your application settings",
    aiModel: "AI Model",
    aiModelDescription: "Select the AI model used for title generation, summarization, and chat",
    selectModel: "Select model",
    language: "Language",
    languageDescription: "Set the language for the application and AI output",
    selectLanguage: "Select language",
    loadError: "Failed to load settings",
    saveError: "Failed to save settings",
  },

  // Sidebar
  sidebar: {
    folders: "Folders",
    allNotes: "All Notes",
    newFolder: "New Folder",
    settings: "Settings",
    logout: "Logout",
    deleteConfirm: "Delete this folder?",
  },

  // Note list
  noteList: {
    notes: "Notes",
    newNote: "New Note",
    noNotes: "No notes",
    searchPlaceholder: "Search notes...",
    untitled: "Untitled",
    deleteConfirm: "Delete this note?",
  },

  // Editor
  editor: {
    title: "Title",
    titlePlaceholder: "Enter title...",
    contentPlaceholder: "Start writing...",
    generateTitle: "Generate title",
    generating: "Generating...",
    lastSaved: "Last saved",
    unsaved: "Unsaved",
    characters: "Characters",
  },

  // AI Panel
  ai: {
    title: "AI Assistant",
    summarize: "Summarize",
    summarizing: "Summarizing...",
    chat: "Chat",
    chatPlaceholder: "Ask a question...",
    send: "Send",
    clearChat: "Clear",
    summary: "Summary",
    emptyNote: "Note content is empty",
  },

  // Auth
  auth: {
    login: "Login",
    register: "Register",
    email: "Email",
    password: "Password",
  },

  // Language names
  languages: {
    auto: "Auto (Browser settings)",
    ja: "日本語",
    en: "English",
  },
} as const;
