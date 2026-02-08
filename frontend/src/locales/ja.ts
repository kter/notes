// Japanese translations
export const ja = {
  // Common
  common: {
    save: "保存",
    cancel: "キャンセル",
    delete: "削除",
    edit: "編集",
    create: "作成",
    loading: "読み込み中...",
    error: "エラー",
    success: "成功",
    saved: "保存しました",
  },

  // Settings
  settings: {
    title: "設定",
    description: "アプリケーションの設定を変更します",
    aiModel: "AIモデル",
    aiModelDescription: "タイトル生成、要約、チャットで使用するAIモデルを選択します",
    selectModel: "モデルを選択",
    language: "言語",
    languageDescription: "アプリケーションとAI出力の言語を設定します",
    selectLanguage: "言語を選択",
    loadError: "設定の読み込みに失敗しました",
    saveError: "設定の保存に失敗しました",
    exportTitle: "データエクスポート",
    exportDescription: "すべてのノートをZIP形式でエクスポートします。",
    exportButton: "ZIPをダウンロード",
    supportTitle: "開発者をサポート",
    supportDescription: "このアプリが気に入ったら、Ko-fiでサポートをご検討ください。",
  },

  // Sidebar
  sidebar: {
    folders: "フォルダ",
    allNotes: "すべてのノート",
    newFolder: "新規フォルダ",
    settings: "設定",
    logout: "ログアウト",
    deleteConfirm: "このフォルダを削除しますか？",
    collapseSidebar: "サイドバーを折りたたむ",
    expandSidebar: "サイドバーを展開",
    folderName: "フォルダ名",
    addFolder: "フォルダを追加",
    confirmCreate: "作成を確定",
    cancelCreate: "作成をキャンセル",
  },

  // Note list
  noteList: {
    notes: "ノート",
    newNote: "新規ノート",
    noNotes: "ノートがありません",
    searchPlaceholder: "ノートを検索...",
    untitled: "無題",
    deleteConfirm: "このノートを削除しますか？",
    noContent: "内容なし",
    createOne: "作成する",
    renameFolder: "フォルダ名を変更",
    deleteFolder: "フォルダを削除",
    noteCount: "{{count}}件のノート",
    noteCountSingular: "{{count}}件のノート",
    addNote: "ノートを追加",
    collapseNoteList: "ノートリストを折りたたむ",
    expandNoteList: "ノートリストを展開",
  },

  // Editor
  editor: {
    title: "タイトル",
    titlePlaceholder: "タイトルを入力...",
    contentPlaceholder: "ノートを入力...",
    generateTitle: "タイトルを生成",
    generating: "生成中...",
    lastSaved: "最終保存",
    unsaved: "未保存",
    unsavedStrictMismatch: "保存された内容と一致しません",
    unsavedLooseMismatch: "変更が保存されていません",
    characters: "文字数",
    noNoteSelected: "ノートが選択されていません",
    selectNoteHint: "リストからノートを選択するか、新規作成してください",
    summarize: "要約",
    summarizing: "要約中...",
    chat: "チャット",
    export: "エクスポート",
    preview: "プレビュー",
    markdown: "Markdown (.md)",
    plainText: "プレーンテキスト (.txt)",
    previewPlaceholder: "プレビューを見るには書き始めてください...",
    noteTitlePlaceholder: "ノートのタイトル",
    noteContentPlaceholder: "Markdownでノートを書き始めましょう...",
    generateTitleFromContent: "内容からタイトルを生成",
    summarizeNote: "ノートを要約",
    toggleChat: "チャットを切り替え",
    exportNote: "ノートをエクスポート",
    share: "共有",
    shareNote: "ノートを共有",
  },

  // AI Panel
  ai: {
    title: "AI アシスタント",
    summarize: "要約",
    summarizing: "要約中...",
    chat: "チャット",
    chatPlaceholder: "質問を入力...",
    send: "送信",
    clearChat: "クリア",
    summary: "要約",
    emptyNote: "ノートの内容がありません",
    chatContext: "チャットコンテキスト",
    currentNote: "現在のノート",
    currentFolder: "現在のフォルダ",
    allNotes: "すべてのノート",
    noNoteSelected: "ノートが選択されていません",
    noFolderSelected: "フォルダが選択されていません",
    allNotesAndFolders: "すべてのノートとフォルダ",
    untitled: "無題",
    howCanIHelp: "何かお手伝いできますか？",
    askAboutNote: "ノートについて質問してください。",
    askAboutFolder: "フォルダについて質問してください。",
    askAboutNotes: "ノートについて質問してください。",
    askAboutCurrentNote: "現在のノートについて質問...",
    askAboutThisFolder: "このフォルダについて質問...",
    askAboutAllNotes: "すべてのノートについて質問...",
    openAIChat: "AIチャットを開く",
  },

  // Auth
  auth: {
    login: "ログイン",
    register: "登録",
    email: "メールアドレス",
    password: "パスワード",
  },

  // Language names
  languages: {
    auto: "自動（ブラウザ設定）",
    ja: "日本語",
    en: "English",
  },

  // Navigation (mobile)
  nav: {
    folders: "フォルダ",
    notes: "ノート",
    editor: "エディタ",
    chat: "チャット",
    viewFolders: "フォルダを表示",
    viewNotes: "ノートを表示",
    viewEditor: "エディタを表示",
    viewChat: "チャットを表示",
  },

  // Sync status
  sync: {
    online: "オンライン",
    offline: "オフライン",
    syncing: "同期中...",
    pendingChanges: "{{count}}件の未同期",
    syncComplete: "同期完了",
    syncError: "同期エラー",
    savedLocally: "ローカルに保存",
  },

  // Share
  share: {
    title: "ノートを共有",
    description: "このリンクを知っている人は誰でもこのノートを閲覧できます",
    copyLink: "リンクをコピー",
    copied: "コピーしました！",
    revokeShare: "共有を解除",
    revokeConfirm: "このノートの共有を解除しますか？",
    createShare: "共有リンクを作成",
    noShare: "このノートは共有されていません",
    viewOnlyNotice: "読み取り専用",
  },
} as const;

// Structural type for translations (allows different string values)
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
    generateTitle: string;
    generating: string;
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
    generateTitleFromContent: string;
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
};

