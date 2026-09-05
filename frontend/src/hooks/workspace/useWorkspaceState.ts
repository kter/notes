"use client";

/**
 * ワークスペース全体の状態・データ・操作を合成するルートフック。
 *
 * 実際の状態は責務ごとに分割された 4 つのスライスが保持する:
 * - useWorkspaceSyncState     : データ層（folders / notes / 同期ステータス）
 * - useWorkspaceUIState       : パネル開閉・モバイルビュー・チャット幅
 * - useWorkspaceNavigationState: 選択・検索・URL 同期・絞り込み
 * - useWorkspaceAIState       : チャット・トークン使用量・AI 編集
 *
 * このフックはそれらを配線し、エディタ連携の橋渡しを加えて、ページコンポーネントへ
 * 従来どおり一括のフラットなインターフェースで提供する。
 *
 * 主なエクスポート:
 * - useWorkspaceState: ワークスペースに必要なすべての状態・ハンドラーを返す
 *
 * 呼び出し関係: WorkspacePage などのトップレベルページコンポーネントから呼ばれる。
 */
import { useCallback, useRef } from "react";

import { useFolders } from "@/hooks/useFolders";
import { useNotes } from "@/hooks/useNotes";
import { noteBodyStore } from "@/lib/sync/noteBodyStore";

import { useWorkspaceAIState } from "./useWorkspaceAIState";
import { useWorkspaceNavigationState } from "./useWorkspaceNavigationState";
import { useWorkspaceSyncState } from "./useWorkspaceSyncState";
import { useWorkspaceUIState } from "./useWorkspaceUIState";

export function useWorkspaceState(isAuthenticated: boolean) {
  // データ層: フォルダ・ノート・同期ステータス
  const {
    folders,
    setFolders,
    notes,
    setNotes,
    isLoading: isDataLoading,
    isOnline,
    syncStatus: offlineSyncStatus,
    lastErrorMessage: offlineSyncErrorMessage,
    pendingChangesCount,
    applySnapshot,
  } = useWorkspaceSyncState(isAuthenticated);

  // UI 層: パネル開閉・モバイルビュー・チャット幅
  const ui = useWorkspaceUIState();

  // ナビゲーション層: 選択・検索・URL 同期・派生値
  const nav = useWorkspaceNavigationState({
    isDataLoading,
    folders,
    notes,
    setMobileView: ui.setMobileView,
  });

  const { handleCreateFolder, handleRenameFolder, handleDeleteFolder } = useFolders(
    folders,
    setFolders,
    nav.selectedFolderId,
    nav.setSelectedFolderId,
    { onSnapshotSynced: applySnapshot }
  );

  const {
    syncStatus,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
    triggerServerSync,
    savedHashes,
  } = useNotes(
    notes,
    setNotes,
    nav.selectedFolderId,
    nav.selectedNoteId,
    nav.handleSelectNote,
    { onSnapshotSynced: applySnapshot }
  );

  // AI 層: チャット・トークン使用量・AI 編集（ノート更新と UI トグルへ橋渡し）
  const ai = useWorkspaceAIState({
    isAuthenticated,
    selectedNoteId: nav.selectedNoteId,
    setContentOverride: nav.setContentOverride,
    handleUpdateNote,
    triggerServerSync,
    setIsChatOpen: ui.setIsChatOpen,
    setMobileView: ui.setMobileView,
  });

  // エディタ連携: 本文・選択範囲の最新値を ref で保持し、購読者へ通知する
  const editorContentRef = useRef("");
  const editorSelectedTextRef = useRef("");
  const selectionSubscribersRef = useRef(new Set<() => void>());

  const handleEditorContentChange = useCallback(
    (content: string) => {
      editorContentRef.current = content;
      if (nav.selectedNoteId) noteBodyStore.set(nav.selectedNoteId, content);
    },
    [nav.selectedNoteId]
  );

  const handleEditorSelectionChange = useCallback((selectedText: string) => {
    editorSelectedTextRef.current = selectedText;
    selectionSubscribersRef.current.forEach((cb) => cb());
  }, []);

  const subscribeToEditorSelectionChange = useCallback((callback: () => void) => {
    selectionSubscribersRef.current.add(callback);
    return () => {
      selectionSubscribersRef.current.delete(callback);
    };
  }, []);

  const getCurrentEditorContent = useCallback((): string => {
    // resolve を使うことで、意図的に空にされた本文が ref のフォールバックに落ちない。
    return noteBodyStore.resolve(nav.selectedNoteId, editorContentRef.current);
  }, [nav.selectedNoteId]);

  return {
    selectedFolderId: nav.selectedFolderId,
    selectedNoteId: nav.selectedNoteId,
    searchQuery: nav.searchQuery,
    isChatOpen: ui.isChatOpen,
    isSidebarOpen: ui.isSidebarOpen,
    isNoteListOpen: ui.isNoteListOpen,
    isSettingsOpen: ui.isSettingsOpen,
    mobileView: ui.mobileView,
    folders,
    notes,
    isDataLoading,
    syncStatus,
    savedHashes,
    isOnline,
    offlineSyncStatus,
    offlineSyncErrorMessage,
    pendingChangesCount,
    tokenUsage: ai.tokenUsage,
    chatMessages: ai.chatMessages,
    isAILoading: ai.isAILoading,
    isEditMode: ai.isEditMode,
    contentOverride: nav.contentOverride,
    chatPanelResize: ui.chatPanelResize,
    selectedNote: nav.selectedNote,
    selectedFolder: nav.selectedFolder,
    selectedFolderName: nav.selectedFolderName,
    filteredNotes: nav.filteredNotes,
    pendingEditEntry: ai.pendingEditEntry,
    setSearchQuery: nav.setSearchQuery,
    setIsChatOpen: ui.setIsChatOpen,
    setIsSidebarOpen: ui.setIsSidebarOpen,
    setIsNoteListOpen: ui.setIsNoteListOpen,
    setIsSettingsOpen: ui.setIsSettingsOpen,
    setMobileView: ui.setMobileView,
    setIsEditMode: ai.setIsEditMode,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleSelectFolder: nav.handleSelectFolder,
    handleSelectNote: nav.handleSelectNote,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
    triggerServerSync,
    handleSummarize: ai.handleSummarize,
    handleSendMessage: ai.handleSendMessage,
    handleSendEditRequest: ai.handleSendEditRequest,
    handleAcceptEditAndApply: ai.handleAcceptEditAndApply,
    handleRejectEdit: ai.handleRejectEdit,
    clearChat: ai.clearChat,
    handleEditorContentChange,
    handleEditorSelectionChange,
    handleToggleSidebar: ui.handleToggleSidebar,
    handleToggleNoteList: ui.handleToggleNoteList,
    handleToggleChat: ui.handleToggleChat,
    handleMobileViewChange: ui.handleMobileViewChange,
    handleSummarizeNote: ai.handleSummarizeNote,
    handleSendEditRequestFromPanel: ai.handleSendEditRequestFromPanel,
    handlePendingAcceptEdit: ai.handlePendingAcceptEdit,
    handlePendingRejectEdit: ai.handlePendingRejectEdit,
    getCurrentEditorContent,
    getCurrentEditorSelectedText: () => editorSelectedTextRef.current,
    subscribeToEditorSelectionChange,
  };
}
