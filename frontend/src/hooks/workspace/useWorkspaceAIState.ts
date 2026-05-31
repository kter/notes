"use client";

/**
 * ワークスペースの AI 関連状態（チャット・トークン使用量・AI 編集の受理/適用）を集約するフック。
 * AI が生成した編集をノートへ反映する際に、ノート更新ハンドラーや UI トグルへ橋渡しする。
 *
 * 主なエクスポート:
 * - useWorkspaceAIState: チャット状態・トークン使用量・AI 編集ハンドラーを返す
 *
 * 呼び出し関係: useWorkspaceState から合成される。ノート更新・サーバー同期・
 *   UI トグルなどを依存として受け取る。
 */
import { useCallback, useMemo } from "react";

import type { MobileView } from "@/components/layout";
import { useAIChat } from "@/hooks/useAIChat";
import { useTokenUsage } from "@/hooks/useTokenUsage";

interface ContentOverride {
  noteId: string;
  content: string;
  version: number;
}

interface AIStateOptions {
  isAuthenticated: boolean;
  selectedNoteId: string | null;
  setContentOverride: (
    updater: (prev: ContentOverride | null) => ContentOverride | null
  ) => void;
  handleUpdateNote: (
    id: string,
    updates: { content?: string; title?: string; folder_id?: string | null },
    options?: { immediate?: boolean }
  ) => void;
  triggerServerSync: (id: string) => void | Promise<void>;
  setIsChatOpen: (open: boolean) => void;
  setMobileView: (view: MobileView) => void;
}

export function useWorkspaceAIState({
  isAuthenticated,
  selectedNoteId,
  setContentOverride,
  handleUpdateNote,
  triggerServerSync,
  setIsChatOpen,
  setMobileView,
}: AIStateOptions) {
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

  const handleAcceptEditAndApply = useCallback(
    (messageIndex: number) => {
      const editedContent = handleAcceptEdit(messageIndex);
      if (editedContent && selectedNoteId) {
        setContentOverride((prev) => ({
          noteId: selectedNoteId,
          content: editedContent,
          version: (prev?.version ?? 0) + 1,
        }));
        handleUpdateNote(
          selectedNoteId,
          { content: editedContent },
          { immediate: true }
        );
      }
    },
    [handleAcceptEdit, handleUpdateNote, selectedNoteId, setContentOverride]
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

  const handleSummarizeNote = useCallback(
    async (id: string) => {
      await triggerServerSync(id);
      await handleSummarize(id);
      setIsChatOpen(true);
      setMobileView("chat");
    },
    [triggerServerSync, handleSummarize, setIsChatOpen, setMobileView]
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

  return {
    tokenUsage,
    chatMessages,
    isAILoading,
    isEditMode,
    setIsEditMode,
    handleSummarize,
    handleSendMessage,
    handleSendEditRequest,
    handleAcceptEditAndApply,
    handleRejectEdit,
    clearChat,
    pendingEditEntry,
    handleSummarizeNote,
    handleSendEditRequestFromPanel,
    handlePendingAcceptEdit,
    handlePendingRejectEdit,
  };
}
