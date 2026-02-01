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
    exportTitle: "Data Export",
    exportDescription: "Export all notes as a ZIP file.",
    exportButton: "Download ZIP",
    supportTitle: "Support the Developer",
    supportDescription: "If you like this app, consider supporting on Ko-fi.",
  },

  // Sidebar
  sidebar: {
    folders: "Folders",
    allNotes: "All Notes",
    newFolder: "New Folder",
    settings: "Settings",
    logout: "Logout",
    deleteConfirm: "Delete this folder?",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
    folderName: "Folder name",
    addFolder: "Add folder",
    confirmCreate: "Confirm create",
    cancelCreate: "Cancel create",
  },

  // Note list
  noteList: {
    notes: "Notes",
    newNote: "New Note",
    noNotes: "No notes",
    searchPlaceholder: "Search notes...",
    untitled: "Untitled",
    deleteConfirm: "Delete this note?",
    noContent: "No content",
    createOne: "Create one",
    renameFolder: "Rename folder",
    deleteFolder: "Delete folder",
    noteCount: "{{count}} notes",
    noteCountSingular: "{{count}} note",
    addNote: "Add note",
    collapseNoteList: "Collapse note list",
    expandNoteList: "Expand note list",
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
    unsavedStrictMismatch: "Content does not match saved version",
    unsavedLooseMismatch: "Changes not saved",
    characters: "Characters",
    noNoteSelected: "No note selected",
    selectNoteHint: "Select a note from the list or create a new one",
    summarize: "Summarize",
    summarizing: "Summarizing...",
    chat: "Chat",
    export: "Export",
    preview: "Preview",
    markdown: "Markdown (.md)",
    plainText: "Plain Text (.txt)",
    previewPlaceholder: "Start writing to see the preview...",
    noteTitlePlaceholder: "Note title",
    noteContentPlaceholder: "Start writing your note in Markdown...",
    generateTitleFromContent: "Generate title from content",
    summarizeNote: "Summarize note",
    toggleChat: "Toggle chat",
    exportNote: "Export note",
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
    chatContext: "Chat Context",
    currentNote: "Current Note",
    currentFolder: "Current Folder",
    allNotes: "All Notes",
    noNoteSelected: "No note selected",
    noFolderSelected: "No folder selected",
    allNotesAndFolders: "All notes and folders",
    untitled: "Untitled",
    howCanIHelp: "How can I help you?",
    askAboutNote: "Ask questions about your note.",
    askAboutFolder: "Ask questions about your folder.",
    askAboutNotes: "Ask questions about your notes.",
    askAboutCurrentNote: "Ask about current note...",
    askAboutThisFolder: "Ask about this folder...",
    askAboutAllNotes: "Ask about all your notes...",
    openAIChat: "Open AI Chat",
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

  // Navigation (mobile)
  nav: {
    folders: "Folders",
    notes: "Notes",
    editor: "Editor",
    chat: "Chat",
    viewFolders: "View Folders",
    viewNotes: "View Notes",
    viewEditor: "View Editor",
    viewChat: "View Chat",
  },

  // Sync status
  sync: {
    online: "Online",
    offline: "Offline",
    syncing: "Syncing...",
    pendingChanges: "{{count}} pending",
    syncComplete: "Sync complete",
    syncError: "Sync error",
    savedLocally: "Saved locally",
  },
} as const;
