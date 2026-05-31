"use client";

/**
 * ワークスペースのパネル開閉・モバイルビュー・チャット幅などの純粋な UI 状態を集約するフック。
 * データやナビゲーションに依存しない表示レイヤーの状態のみを扱う。
 *
 * 主なエクスポート:
 * - useWorkspaceUIState: パネル開閉ステートとトグルハンドラーを返す
 *
 * 呼び出し関係: useWorkspaceState から合成される。
 */
import { useCallback, useState } from "react";

import type { MobileView } from "@/components/layout";
import { usePersistedBoolean } from "@/hooks/usePersistedBoolean";
import { useResizable } from "@/hooks/useResizable";

export function useWorkspaceUIState() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = usePersistedBoolean(
    "notes-sidebar-open",
    true
  );
  const [isNoteListOpen, setIsNoteListOpen] = usePersistedBoolean(
    "notes-notelist-open",
    true
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("folders");

  const chatPanelResize = useResizable({
    storageKey: "notes-chat-width",
    defaultWidth: 320,
    minWidth: 280,
    maxWidth: 600,
    direction: "right",
  });

  const handleToggleSidebar = useCallback(
    () => setIsSidebarOpen((v) => !v),
    [setIsSidebarOpen]
  );
  const handleToggleNoteList = useCallback(
    () => setIsNoteListOpen((v) => !v),
    [setIsNoteListOpen]
  );
  const handleToggleChat = useCallback(() => setIsChatOpen((v) => !v), []);

  const handleMobileViewChange = useCallback((view: MobileView) => {
    setMobileView(view);
    setIsChatOpen(view === "chat");
  }, []);

  return {
    isChatOpen,
    setIsChatOpen,
    isSidebarOpen,
    setIsSidebarOpen,
    isNoteListOpen,
    setIsNoteListOpen,
    isSettingsOpen,
    setIsSettingsOpen,
    mobileView,
    setMobileView,
    chatPanelResize,
    handleToggleSidebar,
    handleToggleNoteList,
    handleToggleChat,
    handleMobileViewChange,
  };
}
