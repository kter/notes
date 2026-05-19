/**
 * アプリケーションの英語翻訳定義ファイル。
 * 全 UI テキストを名前空間ごとにまとめた定数オブジェクト en と、
 * 翻訳キーの型定義 TranslationKeys をエクスポートする。
 *
 * 主なエクスポート:
 * - en: 英語翻訳オブジェクト
 * - TranslationKeys: 翻訳オブジェクトの構造型
 *
 * 呼び出し関係: LanguageContext から effectiveLanguage に応じて参照される。
 */
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
    apiKeysTitle: "API Keys",
    apiKeysDescription: "Create API keys for external folder and note clients.",
    apiKeysEmpty: "No API keys yet.",
    apiKeysNameLabel: "Key name",
    apiKeysNamePlaceholder: "External client",
    apiKeysCreateButton: "Create API key",
    apiKeysCreateError: "Failed to create API key",
    apiKeysListError: "Failed to load API keys",
    apiKeysRevokeButton: "Revoke",
    apiKeysRevokeConfirm: "Revoke this API key?",
    apiKeysRevokeError: "Failed to revoke API key",
    apiKeysCreatedTitle: "New API key",
    apiKeysCreatedDescription: "Copy this secret now. It will only be shown once.",
    apiKeysLastUsed: "Last used",
    apiKeysNeverUsed: "Never used",
    exportTitle: "Data Export",
    exportDescription: "Export all notes as a ZIP file.",
    exportButton: "Download ZIP",
    supportTitle: "Support Developer",
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
    print: "Print",
    markdown: "Markdown (.md)",
    plainText: "Plain Text (.txt)",
    preview: "Preview",
    showEditor: "Show editor",
    hideEditor: "Hide editor",
    resizeEditorPreview: "Resize editor and preview panes",
    previewPlaceholder: "Start writing to see the preview...",
    noteTitlePlaceholder: "Note title",
    noteContentPlaceholder: "Start writing your note in Markdown...",
    summarizeNote: "Summarize note",
    toggleChat: "Toggle chat",
    exportNote: "Export note",
    printPreview: "Print preview",
    share: "Share",
    shareNote: "Share note",
    uploading: "Uploading...",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit Fullscreen",
    imageTooLarge: "Image is too large. Please use an image under 10MB.",
    useLivePreview: "Switch to live preview",
    useRawText: "Switch to raw text",
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
    selection: "Selection",
    selectedLines: "Selected text ({{count}} lines)",
    askAboutSelection: "Ask about the selected text.",
    askAboutCurrentSelection: "Ask about the selected text...",
    noTextSelected: "No text selected",
  },

  // AI Edit
  aiEdit: {
    edit: "Edit",
    editPlaceholder: "Describe the edit you want to make...",
    accept: "Accept",
    reject: "Reject",
    accepted: "Edit applied",
    rejected: "Edit rejected",
    noNoteForEdit: "Select a note to edit",
    noChanges: "No changes were needed",
    reviewInEditor: "Edit proposal ready — review in editor",
    tokenLimitExceeded: "Error: Monthly token limit exceeded. Please try again next month or adjust your settings.",
    editFailed: "Error: Failed to edit content. Please try again.",
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
    savingRemote: "Saving to remote...",
    failedSavedLocally: "Sync failed (saved locally)",
    remoteSaveFailed: "Changes were saved locally, but saving to remote failed",
    savedVerified: "Saved (verified)",
    serverSyncFailed: "Failed to sync with the server",
    offlineSyncUnavailable: "Cannot sync while offline",
    localSaveFailed: "Failed to save locally",
    conflictReloaded: "A sync conflict was detected, so the latest server state was reloaded",
    retryingIn: "Retrying in {{seconds}}s...",
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

  // Weather
  weather: {
    title: "Weather",
    temperature: "Temperature",
    lastUpdated: "Updated",
    condition: {
      clearSky: "Clear sky",
      mainlyClear: "Mainly clear",
      partlyCloudy: "Partly cloudy",
      overcast: "Overcast",
      fog: "Fog",
      drizzle: "Drizzle",
      rain: "Rain",
      snow: "Snow",
      rainShowers: "Rain showers",
      thunderstorm: "Thunderstorm",
      unknown: "Unknown",
    },
  },

  // Sunlight Map
  sunlightMap: {
    title: "Sunlight Map",
    description: "Current day and night areas on Earth",
    yourLocation: "Your current location",
  },
  // Shared note public page
  shared: {
    errorNoToken: "Invalid share link - no token provided",
    errorNotFound: "This shared note was not found or has been revoked.",
    errorExpired: "This share link has expired.",
    errorFailed: "Failed to load the shared note.",
    notFoundTitle: "Not Found",
    errorFallback: "This shared note could not be loaded.",
    goHome: "Go to Home",
    appName: "Notes App",
    logIn: "Log In",
    signUpFree: "Sign Up Free",
    sharedNoteBadge: "Shared Note",
    readOnly: "Read-only",
    untitled: "Untitled",
    lastUpdated: "Last updated:",
    noContent: "*No content*",
    ctaTitle: "Create your own notes with AI",
    ctaDescription:
      "Join thousands of users organizing their thoughts with our AI-powered note-taking app. Auto-tagging, summarization, and smart search included for free.",
    getStartedFree: "Get Started Free",
    allRightsReserved: "All rights reserved.",
    home: "Home",
    signUp: "Sign Up",
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
    apiKeysTitle: string;
    apiKeysDescription: string;
    apiKeysEmpty: string;
    apiKeysNameLabel: string;
    apiKeysNamePlaceholder: string;
    apiKeysCreateButton: string;
    apiKeysCreateError: string;
    apiKeysListError: string;
    apiKeysRevokeButton: string;
    apiKeysRevokeConfirm: string;
    apiKeysRevokeError: string;
    apiKeysCreatedTitle: string;
    apiKeysCreatedDescription: string;
    apiKeysLastUsed: string;
    apiKeysNeverUsed: string;
    exportTitle: string;
    exportDescription: string;
    exportButton: string;
    supportTitle: string;
    supportDescription: string;
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
    print: string;
    markdown: string;
    plainText: string;
    preview: string;
    showEditor: string;
    hideEditor: string;
    resizeEditorPreview: string;
    previewPlaceholder: string;
    noteTitlePlaceholder: string;
    noteContentPlaceholder: string;
    summarizeNote: string;
    toggleChat: string;
    exportNote: string;
    printPreview: string;
    share: string;
    shareNote: string;
    uploading: string;
    fullscreen: string;
    exitFullscreen: string;
    imageTooLarge: string;
    useLivePreview: string;
    useRawText: string;
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
    selection: string;
    selectedLines: string;
    askAboutSelection: string;
    askAboutCurrentSelection: string;
    noTextSelected: string;
  };
  aiEdit: {
    edit: string;
    editPlaceholder: string;
    accept: string;
    reject: string;
    accepted: string;
    rejected: string;
    noNoteForEdit: string;
    noChanges: string;
    reviewInEditor: string;
    tokenLimitExceeded: string;
    editFailed: string;
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
    savingRemote: string;
    failedSavedLocally: string;
    remoteSaveFailed: string;
    savedVerified: string;
    serverSyncFailed: string;
    offlineSyncUnavailable: string;
    localSaveFailed: string;
    conflictReloaded: string;
    retryingIn: string;
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
  weather: {
    title: string;
    temperature: string;
    lastUpdated: string;
    condition: {
      clearSky: string;
      mainlyClear: string;
      partlyCloudy: string;
      overcast: string;
      fog: string;
      drizzle: string;
      rain: string;
      snow: string;
      rainShowers: string;
      thunderstorm: string;
      unknown: string;
    };
  };
  sunlightMap: {
    title: string;
    description: string;
    yourLocation: string;
  };
  shared: {
    errorNoToken: string;
    errorNotFound: string;
    errorExpired: string;
    errorFailed: string;
    notFoundTitle: string;
    errorFallback: string;
    goHome: string;
    appName: string;
    logIn: string;
    signUpFree: string;
    sharedNoteBadge: string;
    readOnly: string;
    untitled: string;
    lastUpdated: string;
    noContent: string;
    ctaTitle: string;
    ctaDescription: string;
    getStartedFree: string;
    allRightsReserved: string;
    home: string;
    signUp: string;
  };
};
