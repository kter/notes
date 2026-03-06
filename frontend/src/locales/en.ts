// English translations

export const en = {
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
    copy: "Copy",
    copied: "Copied!",
    done: "Done",
    days: "days",
    year: "year",
  },

  // Settings
  settings: {
    title: "Settings",
    description: "Manage your application settings",
    aiModel: "AI Model",
    aiModelDescription: "Select the AI model used for summarization and chat",
    selectModel: "Select model",
    language: "Language",
    languageDescription: "Set language for application and AI output",
    selectLanguage: "Select language",
    loadError: "Failed to load settings",
    saveError: "Failed to save settings",
    exportTitle: "Data Export",
    exportDescription: "Export all notes as a ZIP file.",
    exportButton: "Download ZIP",
    supportTitle: "Support Developer",
    supportDescription: "If you like this app, consider supporting on Ko-fi.",
    mcpSection: "MCP API Keys",
    mcpDescription: "Manage API keys for accessing your notes from Claude Desktop and other MCP clients. Maximum 2 active API keys per user.",
    mcpNoTokens: "No API keys",
    mcpCreateToken: "Create API Key",
    mcpMaxTokensReached: "Maximum 2 active API keys allowed",
    mcpTokenActive: "Active",
    mcpTokenRevoked: "Revoked",
    mcpTokenExpires: "Expires at",
    mcpRevokeToken: "Revoke",
    mcpDeleteToken: "Delete",
    createApiKey: "Create API Key",
    createApiKeyDescription: "Create a new API key for MCP access. Please specify the purpose.",
    apiKeyNameRequired: "Purpose is required",
    apiKeyName: "Purpose",
    apiKeyNamePlaceholder: "e.g., VSCode, Inspector",
    apiKey: "API Key",
    apiKeyCreated: "API key created",
    apiKeyWarning: "This API key will only be shown once. Save it securely.",
    mcpDeleteConfirm: "Delete this API key? This action cannot be undone.",
    mcpTokenLastUsed: "Last used",
    mcpTokenNeverUsed: "Never",
    mcpRestoreKey: "Reactivate",
    mcpRestoreConfirm: "Reactivate this API key?",
    mcpRestored: "Reactivated",
    mcpTokenExpiration: "Expiration",
    mcpSelectExpiration: "Select expiration",
    mcpNoExpiration: "No expiration",
    mcpExpirationNote: "You can only create 1 non-expiring key per user.",
    mcpServerConfig: "MCP Server Configuration",
    mcpServerUrl: "MCP Server URL",
    mcpServerDescription: "Server URL for connecting to MCP clients like Claude Desktop.",
    mcpConnectionDescription: "Set up MCP clients like Claude Desktop by copying the server URL and creating API keys. Maximum 2 active API keys per user.",
    mcpCopyUrl: "Copy URL",
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
    summarizeNote: "Summarize note",
    toggleChat: "Toggle chat",
    exportNote: "Export note",
    share: "Share",
    shareNote: "Share note",
    uploading: "Uploading...",
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

  // Share
  share: {
    title: "Share Note",
    description: "Anyone with this link can view this note",
    copyLink: "Copy Link",
    copied: "Copied!",
    revokeShare: "Revoke Share",
    revokeConfirm: "Revoke access to this shared note?",
    createShare: "Create Share Link",
    noShare: "This note is not shared",
    viewOnlyNotice: "Read-only view",
  },

  // Token Usage
  tokenUsage: {
    title: "Language Model Token Usage",
    used: "Tokens Used",
    limit: "Monthly Limit",
    resetDate: "Reset Date",
    exceeded: "Monthly token limit exceeded. Your usage will reset at the beginning of next month.",
  },
};

// Export type
export type TranslationKeys = {
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    create: string;
    loading: string;
    error: string;
    success: string;
    saved: string;
    copy: string;
    copied: string;
    done: string;
    days: string;
    year: string;
  };
  settings: {
    title: string;
    description: string;
    aiModel: string;
    aiModelDescription: string;
    selectModel: string;
    language: string;
    languageDescription: string;
    selectLanguage: string;
    loadError: string;
    saveError: string;
    exportTitle: string;
    exportDescription: string;
    exportButton: string;
    supportTitle: string;
    supportDescription: string;
    mcpSection: string;
    mcpDescription: string;
    mcpNoTokens: string;
    mcpCreateToken: string;
    mcpMaxTokensReached: string;
    mcpTokenActive: string;
    mcpTokenRevoked: string;
    mcpTokenExpires: string;
    mcpRevokeToken: string;
    mcpDeleteToken: string;
    createApiKey: string;
    createApiKeyDescription: string;
    apiKeyNameRequired: string;
    apiKeyName: string;
    apiKeyNamePlaceholder: string;
    apiKey: string;
    apiKeyCreated: string;
    apiKeyWarning: string;
    mcpDeleteConfirm: string;
    mcpTokenLastUsed: string;
    mcpTokenNeverUsed: string;
    mcpRestoreKey: string;
    mcpRestoreConfirm: string;
    mcpRestored: string;
    mcpTokenExpiration: string;
    mcpSelectExpiration: string;
    mcpNoExpiration: string;
    mcpExpirationNote: string;
    mcpServerConfig: string;
    mcpServerUrl: string;
    mcpServerDescription: string;
    mcpCopyUrl: string;
  };
  sidebar: {
    folders: string;
    allNotes: string;
    newFolder: string;
    settings: string;
    logout: string;
    deleteConfirm: string;
    collapseSidebar: string;
    expandSidebar: string;
    folderName: string;
    addFolder: string;
    confirmCreate: string;
    cancelCreate: string;
  };
  noteList: {
    notes: string;
    newNote: string;
    noNotes: string;
    searchPlaceholder: string;
    untitled: string;
    deleteConfirm: string;
    noContent: string;
    createOne: string;
    renameFolder: string;
    deleteFolder: string;
    noteCount: string;
    noteCountSingular: string;
    addNote: string;
    collapseNoteList: string;
    expandNoteList: string;
  };
  editor: {
    title: string;
    titlePlaceholder: string;
    contentPlaceholder: string;
    lastSaved: string;
    unsaved: string;
    unsavedStrictMismatch: string;
    unsavedLooseMismatch: string;
    characters: string;
    noNoteSelected: string;
    selectNoteHint: string;
    summarize: string;
    summarizing: string;
    chat: string;
    export: string;
    preview: string;
    markdown: string;
    plainText: string;
    previewPlaceholder: string;
    noteTitlePlaceholder: string;
    noteContentPlaceholder: string;
    summarizeNote: string;
    toggleChat: string;
    exportNote: string;
    share: string;
    shareNote: string;
  };
  ai: {
    title: string;
    summarize: string;
    summarizing: string;
    chat: string;
    chatPlaceholder: string;
    send: string;
    clearChat: string;
    summary: string;
    emptyNote: string;
    chatContext: string;
    currentNote: string;
    currentFolder: string;
    allNotes: string;
    noNoteSelected: string;
    noFolderSelected: string;
    allNotesAndFolders: string;
    untitled: string;
    howCanIHelp: string;
    askAboutNote: string;
    askAboutFolder: string;
    askAboutNotes: string;
    askAboutCurrentNote: string;
    askAboutThisFolder: string;
    askAboutAllNotes: string;
    openAIChat: string;
  };
  auth: {
    login: string;
    register: string;
    email: string;
    password: string;
  };
  languages: {
    auto: string;
    ja: string;
    en: string;
  };
  nav: {
    folders: string;
    notes: string;
    editor: string;
    chat: string;
    viewFolders: string;
    viewNotes: string;
    viewEditor: string;
    viewChat: string;
  };
  sync: {
    online: string;
    offline: string;
    syncing: string;
    pendingChanges: string;
    syncComplete: string;
    syncError: string;
    savedLocally: string;
  };
  share: {
    title: string;
    description: string;
    copyLink: string;
    copied: string;
    revokeShare: string;
    revokeConfirm: string;
    createShare: string;
    noShare: string;
    viewOnlyNotice: string;
  };
  tokenUsage: {
    title: string;
    used: string;
    limit: string;
    resetDate: string;
    exceeded: string;
  };
};
