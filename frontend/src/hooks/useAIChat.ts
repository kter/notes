"use client";

import { useState } from "react";
import { useApi } from "./useApi";
import { useTranslation } from "./useTranslation";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/types";

export type ChatScope = "note" | "folder" | "all";
const EDIT_JOB_POLL_INTERVAL_MS = 1500;
const EDIT_JOB_TIMEOUT_MS = 120000;

interface UseAIChatReturn {
  chatMessages: ChatMessage[];
  isAILoading: boolean;
  isEditMode: boolean;
  setIsEditMode: (v: boolean) => void;
  handleSummarize: (noteId: string) => Promise<void>;
  handleSendMessage: (
    message: string,
    scope: ChatScope,
    noteId?: string | null,
    folderId?: string | null
  ) => Promise<void>;
  handleSendEditRequest: (
    instruction: string,
    currentContent: string,
    noteId?: string
  ) => Promise<void>;
  handleAcceptEdit: (messageIndex: number) => string | null;
  handleRejectEdit: (messageIndex: number) => void;
  clearChat: () => void;
}

export function useAIChat(onTokenUsage?: (tokens: number) => void): UseAIChatReturn {
  const { getApi } = useApi();
  const { t } = useTranslation();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // We no longer clear chat automatically when note changes to allow persistent chat.
  // The user can clear it manually if needed.

  const handleSummarize = async (noteId: string) => {
    setIsAILoading(true);
    try {
      const apiClient = await getApi();
      const result = await apiClient.summarizeNote({ note_id: noteId });

      if (result.tokens_used && onTokenUsage) {
        onTokenUsage(result.tokens_used);
      }

      // Add summary as a chat message
      const summaryMessage: ChatMessage = {
        role: "assistant",
        content: result.summary,
      };
      setChatMessages((prev) => [...prev, summaryMessage]);
    } catch (error: unknown) {
      logger.error("Failed to summarize", error);
      if ((error as { status?: number })?.status === 429) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: t("aiEdit.tokenLimitExceeded") }]);
      }
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSendMessage = async (
    message: string,
    scope: ChatScope,
    noteId?: string | null,
    folderId?: string | null
  ) => {
    const userMessage: ChatMessage = { role: "user", content: message };
    setChatMessages((prev) => [...prev, userMessage]);
    setIsAILoading(true);

    try {
      const apiClient = await getApi();
      const result = await apiClient.chatWithNote({
        scope,
        note_id: noteId || undefined,
        folder_id: folderId || undefined,
        question: message,
        history: chatMessages,
      });

      if (result.tokens_used && onTokenUsage) {
        onTokenUsage(result.tokens_used);
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: result.answer,
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error: unknown) {
      logger.error("Failed to chat", error);
      if ((error as { status?: number })?.status === 429) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: t("aiEdit.tokenLimitExceeded") }]);
      }
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSendEditRequest = async (
    instruction: string,
    currentContent: string,
    noteId?: string
  ) => {
    const userMessage: ChatMessage = { role: "user", content: instruction };
    setChatMessages((prev) => [...prev, userMessage]);
    setIsAILoading(true);

    try {
      const apiClient = await getApi();
      const createResult = await apiClient.createEditJob({
        content: currentContent,
        instruction,
        note_id: noteId,
      });

      const startedAt = Date.now();
      let job = createResult.job;

      while (job.status === "pending" || job.status === "running") {
        if (Date.now() - startedAt >= EDIT_JOB_TIMEOUT_MS) {
          throw new Error("Edit job polling timed out");
        }

        await new Promise((resolve) => setTimeout(resolve, EDIT_JOB_POLL_INTERVAL_MS));
        job = await apiClient.getEditJob(job.id);
      }

      if (job.status === "failed") {
        throw new Error(job.error_message || "Edit job failed");
      }

      const result = {
        edited_content: job.edited_content || currentContent,
        tokens_used: job.tokens_used,
      };

      if (result.tokens_used && onTokenUsage) {
        onTokenUsage(result.tokens_used);
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: result.edited_content === currentContent
          ? instruction
          : "",
        editProposal: {
          originalContent: currentContent,
          editedContent: result.edited_content,
          status: result.edited_content === currentContent ? undefined : "pending",
        },
      };

      // If no changes, show a message instead of diff
      if (result.edited_content === currentContent) {
        assistantMessage.content = "";
        assistantMessage.editProposal = undefined;
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: t("aiEdit.noChanges") },
        ]);
      } else {
        setChatMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error: unknown) {
      logger.error("Failed to edit", error);
      if ((error as { status?: number })?.status === 429) {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: t("aiEdit.tokenLimitExceeded") },
        ]);
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes("monthly token limit exceeded")
      ) {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: t("aiEdit.tokenLimitExceeded") },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: t("aiEdit.editFailed") },
        ]);
      }
    } finally {
      setIsAILoading(false);
    }
  };

  const handleAcceptEdit = (messageIndex: number): string | null => {
    const msg = chatMessages[messageIndex];
    if (!msg?.editProposal || msg.editProposal.status !== "pending") return null;

    const editedContent = msg.editProposal.editedContent;
    setChatMessages((prev) =>
      prev.map((m, i) =>
        i === messageIndex && m.editProposal
          ? { ...m, editProposal: { ...m.editProposal, status: "accepted" as const } }
          : m
      )
    );
    return editedContent;
  };

  const handleRejectEdit = (messageIndex: number) => {
    setChatMessages((prev) =>
      prev.map((m, i) =>
        i === messageIndex && m.editProposal
          ? { ...m, editProposal: { ...m.editProposal, status: "rejected" as const } }
          : m
      )
    );
  };

  const clearChat = () => {
    setChatMessages([]);
  };

  return {
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
  };
}
