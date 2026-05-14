"use client";

/**
 * エディタ表示モード（ライブプレビュー装飾 / 生テキスト）をグローバルに管理するフック。
 * 設定は localStorage に単一キーで永続化し、全ノートで共通して使用される。
 *
 * 主なエクスポート:
 * - EditorDisplayMode: 表示モードの型
 * - useEditorDisplayMode: { mode, setMode } を返すフック
 *
 * 呼び出し関係: EditorPanel から使用される。
 */

import { useState, useEffect } from "react";

export type EditorDisplayMode = "live-preview" | "raw";

const STORAGE_KEY = "editor-display-mode";
const DEFAULT_MODE: EditorDisplayMode = "raw";

/**
 * 永続化された表示モードを読み込み、変更を localStorage に書き込む。
 * SSR 安全: useState の初期値は DEFAULT_MODE、マウント後に localStorage を読んで同期する。
 */
export function useEditorDisplayMode(): {
  mode: EditorDisplayMode;
  setMode: (mode: EditorDisplayMode) => void;
} {
  const [mode, setModeState] = useState<EditorDisplayMode>(DEFAULT_MODE);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "live-preview" || saved === "raw") {
      setModeState(saved);
    }
  }, []);

  const setMode = (newMode: EditorDisplayMode) => {
    setModeState(newMode);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newMode);
    }
  };

  return { mode, setMode };
}
