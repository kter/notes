"use client";

import { useCallback, useRef, useState } from "react";

import type { MobileView } from "@/components/layout";
import { useAIChat } from "@/hooks/useAIChat";
import { useFolders } from "@/hooks/useFolders";
import { useHomeData } from "@/hooks/useHomeData";
import { useNoteFilter } from "@/hooks/useNoteFilter";
import { useNotes } from "@/hooks/useNotes";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { useResizable } from "@/hooks/useResizable";
import { useTokenUsage } from "@/hooks/useTokenUsage";

export function useWorkspaceState(isAuthenticated: boolean) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNoteListOpen, setIsNoteListOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("folders");
  const [contentOverride, setContentOverride] = useState<{
    content: string;
    version: number;
  } | null>(null);

  const editorContentRef = useRef("");

  const {
    folders,
    setFolders,
    notes,
    setNotes,
    isLoading: isDataLoading,
  } = useHomeData(isAuthenticated);

  const { handleCreateFolder, handleRenameFolder, handleDeleteFolder } = useFolders(
    folders,
    setFolders,
    selectedFolderId,
    setSelectedFolderId
  );

  const handleSelectFolder = useCallback((id: string | null) => {
    setSelectedFolderId(id);
    setSearchQuery("");
    setMobileView("notes");
  }, []);

  const handleSelectNote = useCallback((id: string | null) => {
    setSelectedNoteId(id);
    if (id) {
      setMobileView("editor");
    }
  }, []);

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
    handleSelectNote
  );

  const {
    isOnline,
    syncStatus: offlineSyncStatus,
    lastErrorMessage: offlineSyncErrorMessage,
    pendingChangesCount,
  } = useOfflineSync();

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
  }, []);

  const handleAcceptEditAndApply = useCallback(
    (messageIndex: number) => {
      const editedContent = handleAcceptEdit(messageIndex);
      if (editedContent && selectedNoteId) {
        setContentOverride((prev) => ({
          content: editedContent,
          version: (prev?.version ?? 0) + 1,
        }));
        handleUpdateNote(selectedNoteId, { content: editedContent });
      }
    },
    [handleAcceptEdit, handleUpdateNote, selectedNoteId]
  );

  const pendingEditEntry = chatMessages.reduce<{
    message: (typeof chatMessages)[0];
    index: number;
  } | null>(
    (found, message, index) =>
      message.editProposal?.status === "pending"
        ? { message, index }
        : found,
    null
  );

  const chatPanelResize = useResizable({
    storageKey: "notes-chat-width",
    defaultWidth: 320,
    minWidth: 280,
    maxWidth: 600,
    direction: "right",
  });

  const selectedNote = notes.find((note) => note.id === selectedNoteId) || null;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) || null;
  const selectedFolderName = selectedFolder?.name;
  const filteredNotes = useNoteFilter(notes, selectedFolderId, searchQuery);

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
    getCurrentEditorContent: () => editorContentRef.current,
  };
}
