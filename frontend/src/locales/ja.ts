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
  },

  // Sidebar
  sidebar: {
    folders: "フォルダ",
    allNotes: "すべてのノート",
    newFolder: "新規フォルダ",
    settings: "設定",
    logout: "ログアウト",
    deleteConfirm: "このフォルダを削除しますか？",
  },

  // Note list
  noteList: {
    notes: "ノート",
    newNote: "新規ノート",
    noNotes: "ノートがありません",
    searchPlaceholder: "ノートを検索...",
    untitled: "無題",
    deleteConfirm: "このノートを削除しますか？",
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
    characters: "文字数",
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
  };
  sidebar: {
    folders: string;
    allNotes: string;
    newFolder: string;
    settings: string;
    logout: string;
    deleteConfirm: string;
  };
  noteList: {
    notes: string;
    newNote: string;
    noNotes: string;
    searchPlaceholder: string;
    untitled: string;
    deleteConfirm: string;
  };
  editor: {
    title: string;
    titlePlaceholder: string;
    contentPlaceholder: string;
    generateTitle: string;
    generating: string;
    lastSaved: string;
    unsaved: string;
    characters: string;
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
};

