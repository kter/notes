"use client";

/**
 * ワークスペース全体の UI 状態・データ・操作を集約するルートフック。
 * フォルダ/ノート/チャット/エディタ/モバイルビューなど全画面に関わるステートと
 * ハンドラーをまとめ、ページコンポーネントへ一括提供する。
 *
 * 主なエクスポート:
 * - useWorkspaceState: ワークスペースに必要なすべての状態・ハンドラーを返す
 *
 * 呼び出し関係: WorkspacePage などのトップレベルページコンポーネントから呼ばれる。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { MobileView } from "@/components/layout";
import { useAIChat } from "@/hooks/useAIChat";
import { useFolders } from "@/hooks/useFolders";
import { useNoteFilter } from "@/hooks/useNoteFilter";
import { useNotes } from "@/hooks/useNotes";
import { useResizable } from "@/hooks/useResizable";
import { useTokenUsage } from "@/hooks/useTokenUsage";
import { noteBodyStore } from "@/lib/sync/noteBodyStore";

import { useWorkspaceSyncState } from "./useWorkspaceSyncState";

export function useWorkspaceState(isAuthenticated: boolean) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlNoteId = searchParams.get("note");
  const urlFolderId = searchParams.get("folder");

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNoteListOpen, setIsNoteListOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("folders");
  const [contentOverride, setContentOverride] = useState<{
    noteId: string;
    content: string;
    version: number;
  } | null>(null);

  const editorContentRef = useRef("");
  const editorSelectedTextRef = useRef("");
  const selectionSubscribersRef = useRef(new Set<() => void>());

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

  const { handleCreateFolder, handleRenameFolder, handleDeleteFolder } = useFolders(
    folders,
    setFolders,
    selectedFolderId,
    setSelectedFolderId,
    { onSnapshotSynced: applySnapshot }
  );

  /** ?folder=<id>&?note=<id> を含む URL 文字列を生成するヘルパー。 */
  const buildHref = useCallback(
    (folderId: string | null, noteId: string | null) => {
      const params = new URLSearchParams();
      if (folderId) params.set("folder", folderId);
      if (noteId) params.set("note", noteId);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname]
  );

  // URL クエリパラメータから選択状態を復元する。
  // isDataLoading が true の間は folders/notes が未確定なので ID の有効性を検証できない。
  // prev との比較は、同一値での setState を省略して不要な再レンダーを防ぐため。
  useEffect(() => {
    if (isDataLoading) return;
    const validFolderId =
      urlFolderId && folders.some((f) => f.id === urlFolderId) ? urlFolderId : null;
    const validNoteId =
      urlNoteId && notes.some((n) => n.id === urlNoteId) ? urlNoteId : null;

    setSelectedFolderId((prev) => (prev !== validFolderId ? validFolderId : prev));
    setSelectedNoteId((prev) => {
      if (prev === validNoteId) return prev;
      setContentOverride(null);
      if (validNoteId) setMobileView("editor");
      return validNoteId;
    });
  }, [urlFolderId, urlNoteId, isDataLoading, folders, notes]);

  const handleSelectFolder = useCallback(
    (id: string | null) => {
      setSelectedFolderId(id);
      setSearchQuery("");
      setMobileView("notes");
      router.push(buildHref(id, selectedNoteId), { scroll: false });
    },
    [router, buildHref, selectedNoteId]
  );

  const handleSelectNote = useCallback(
    (id: string | null) => {
      setSelectedNoteId(id);
      setContentOverride(null);
      if (id) setMobileView("editor");
      router.push(buildHref(selectedFolderId, id), { scroll: false });
    },
    [router, buildHref, selectedFolderId]
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
    selectedFolderId,
    selectedNoteId,
    handleSelectNote,
    { onSnapshotSynced: applySnapshot }
  );

  const { tokenUsage, recordUsage } = useTokenUsage(isAuthenticated);
  const {
    chatMessages,
    isAILoading,
    isEditMode,
    setIsEditMode,
    handleSummarize,
    handleSendMessage,
    handleSendEditRequest,
    handleAcceptEdit,
    handleRejectEdit,
    clearChat,
  } = useAIChat(recordUsage);

  const handleEditorContentChange = useCallback((content: string) => {
    editorContentRef.current = content;
    if (selectedNoteId) noteBodyStore.set(selectedNoteId, content);
  }, [selectedNoteId]);

  const handleEditorSelectionChange = useCallback((selectedText: string) => {
    editorSelectedTextRef.current = selectedText;
    selectionSubscribersRef.current.forEach((cb) => cb());
  }, []);

  const subscribeToEditorSelectionChange = useCallback(
    (callback: () => void) => {
      selectionSubscribersRef.current.add(callback);
      return () => { selectionSubscribersRef.current.delete(callback); };
    },
    []
  );

  const handleAcceptEditAndApply = useCallback(
    (messageIndex: number) => {
      const editedContent = handleAcceptEdit(messageIndex);
      if (editedContent && selectedNoteId) {
        setContentOverride((prev) => ({
          noteId: selectedNoteId,
          content: editedContent,
          version: (prev?.version ?? 0) + 1,
        }));
        handleUpdateNote(selectedNoteId, { content: editedContent }, { immediate: true });
      }
    },
    [handleAcceptEdit, handleUpdateNote, selectedNoteId]
  );

  const pendingEditEntry = useMemo(
    () =>
      chatMessages.reduce<{
        message: (typeof chatMessages)[0];
        index: number;
      } | null>(
        (found, message, index) =>
          message.editProposal?.status === "pending" ? { message, index } : found,
        null
      ),
    [chatMessages]
  );

  const chatPanelResize = useResizable({
    storageKey: "notes-chat-width",
    defaultWidth: 320,
    minWidth: 280,
    maxWidth: 600,
    direction: "right",
  });

  const handleToggleSidebar = useCallback(() => setIsSidebarOpen((v) => !v), []);
  const handleToggleNoteList = useCallback(() => setIsNoteListOpen((v) => !v), []);
  const handleToggleChat = useCallback(() => setIsChatOpen((v) => !v), []);

  const handleMobileViewChange = useCallback((view: MobileView) => {
    setMobileView(view);
    setIsChatOpen(view === "chat");
  }, []);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );
  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );
  const selectedFolderName = selectedFolder?.name;
  const filteredNotes = useNoteFilter(notes, selectedFolderId, searchQuery);

  const handleSummarizeNote = useCallback(
    async (id: string) => {
      await triggerServerSync(id);
      await handleSummarize(id);
      setIsChatOpen(true);
      setMobileView("chat");
    },
    [triggerServerSync, handleSummarize]
  );

  const handleSendEditRequestFromPanel = useCallback(
    (
      instruction: string,
      content: string,
      noteId?: string,
      selectionRange?: { start: number; end: number }
    ) => handleSendEditRequest(instruction, content, noteId, selectionRange),
    [handleSendEditRequest]
  );

  const handlePendingAcceptEdit = useMemo(
    () =>
      pendingEditEntry
        ? () => handleAcceptEditAndApply(pendingEditEntry.index)
        : undefined,
    [pendingEditEntry, handleAcceptEditAndApply]
  );

  const handlePendingRejectEdit = useMemo(
    () =>
      pendingEditEntry
        ? () => handleRejectEdit(pendingEditEntry.index)
        : undefined,
    [pendingEditEntry, handleRejectEdit]
  );

  const getCurrentEditorContent = useCallback((): string => {
    return (selectedNoteId && noteBodyStore.get(selectedNoteId)) || editorContentRef.current;
  }, [selectedNoteId]);

  return {
    selectedFolderId,
    selectedNoteId,
    searchQuery,
    isChatOpen,
    isSidebarOpen,
    isNoteListOpen,
    isSettingsOpen,
    mobileView,
    folders,
    notes,
    isDataLoading,
    syncStatus,
    savedHashes,
    isOnline,
    offlineSyncStatus,
    offlineSyncErrorMessage,
    pendingChangesCount,
    tokenUsage,
    chatMessages,
    isAILoading,
    isEditMode,
    contentOverride,
    chatPanelResize,
    selectedNote,
    selectedFolder,
    selectedFolderName,
    filteredNotes,
    pendingEditEntry,
    setSearchQuery,
    setIsChatOpen,
    setIsSidebarOpen,
    setIsNoteListOpen,
    setIsSettingsOpen,
    setMobileView,
    setIsEditMode,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleSelectFolder,
    handleSelectNote,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
    triggerServerSync,
    handleSummarize,
    handleSendMessage,
    handleSendEditRequest,
    handleAcceptEditAndApply,
    handleRejectEdit,
    clearChat,
    handleEditorContentChange,
    handleEditorSelectionChange,
    handleToggleSidebar,
    handleToggleNoteList,
    handleToggleChat,
    handleMobileViewChange,
    handleSummarizeNote,
    handleSendEditRequestFromPanel,
    handlePendingAcceptEdit,
    handlePendingRejectEdit,
    getCurrentEditorContent,
    getCurrentEditorSelectedText: () => editorSelectedTextRef.current,
    subscribeToEditorSelectionChange,
  };
}
