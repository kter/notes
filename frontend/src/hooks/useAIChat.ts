"use client";

/**
 * AIチャット・AI編集機能をまとめて管理するフック。
 * ノート要約・チャット送信・編集ジョブのポーリング・編集提案の承認/却下を担い、
 * トークン消費時は onTokenUsage コールバックで呼び出し元に通知する。
 *
 * 主なエクスポート:
 * - useAIChat: chatMessages / isAILoading / isEditMode / handleSummarize /
 *              handleSendMessage / handleSendEditRequest / handleAcceptEdit /
 *              handleRejectEdit / clearChat などを返す
 *
 * 呼び出し関係: useWorkspaceState から呼ばれる。
 */
import { useState } from "react";
import { useApi } from "./useApi";
import { useTranslation } from "./useTranslation";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/types";

export type ChatScope = "note" | "folder" | "all" | "selection";
const JOB_POLL_INTERVAL_MS = 1500;
const JOB_TIMEOUT_MS = 120000;

/**
 * 非同期 AI ジョブ（要約・チャット・編集）を完了/失敗まで一定間隔でポーリングする共通ヘルパ。
 * pending/running の間ポーリングし、タイムアウト時は例外を送出する。
 */
async function pollJob<T extends { id: string; status: string }>(
  initial: T,
  fetchJob: (id: string) => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  let job = initial;
  while (job.status === "pending" || job.status === "running") {
    if (Date.now() - startedAt >= JOB_TIMEOUT_MS) {
      throw new Error("AI job polling timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    job = await fetchJob(job.id);
  }
  return job;
}

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
    folderId?: string | null,
    selectedContent?: string
  ) => Promise<void>;
  handleSendEditRequest: (
    instruction: string,
    currentContent: string,
    noteId?: string,
    selectionRange?: { start: number; end: number }
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
      // 非同期ジョブを作成しポーリングで結果を取得する（30 秒同期上限の回避）
      const created = await apiClient.createSummarizeJob({ note_id: noteId });
      const job = await pollJob(created, (id) => apiClient.getAIJob(id));

      if (job.status === "failed") {
        throw new Error(job.error_message || "Summarize failed");
      }

      if (job.tokens_used && onTokenUsage) {
        onTokenUsage(job.tokens_used);
      }

      const summaryMessage: ChatMessage = {
        role: "assistant",
        content: job.result ?? "",
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
    folderId?: string | null,
    selectedContent?: string
  ) => {
    const userMessage: ChatMessage = { role: "user", content: message };
    setChatMessages((prev) => [...prev, userMessage]);
    setIsAILoading(true);

    try {
      const apiClient = await getApi();
      // 非同期ジョブを作成しポーリングで回答を取得する（30 秒同期上限の回避）
      const created = await apiClient.createChatJob({
        scope,
        note_id: noteId || undefined,
        folder_id: folderId || undefined,
        question: message,
        history: chatMessages,
        selected_content: scope === "selection" ? selectedContent : undefined,
      });
      const job = await pollJob(created, (id) => apiClient.getAIJob(id));

      if (job.status === "failed") {
        throw new Error(job.error_message || "Chat failed");
      }

      if (job.tokens_used && onTokenUsage) {
        onTokenUsage(job.tokens_used);
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: job.result ?? "",
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
    noteId?: string,
    selectionRange?: { start: number; end: number }
  ) => {
    const userMessage: ChatMessage = { role: "user", content: instruction };
    setChatMessages((prev) => [...prev, userMessage]);
    setIsAILoading(true);

    const contentToEdit = selectionRange
      ? currentContent.slice(selectionRange.start, selectionRange.end)
      : currentContent;

    try {
      const apiClient = await getApi();
      const createResult = await apiClient.createEditJob({
        content: contentToEdit,
        instruction,
        note_id: noteId,
      });

      const job = await pollJob(createResult.job, (id) =>
        apiClient.getEditJob(id)
      );

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
        content: result.edited_content === contentToEdit
          ? instruction
          : "",
        editProposal: {
          originalContent: currentContent,
          editedContent: selectionRange
            ? currentContent.slice(0, selectionRange.start) + result.edited_content + currentContent.slice(selectionRange.end)
            : result.edited_content,
          status: result.edited_content === contentToEdit ? undefined : "pending",
          selectionRange,
        },
      };

      // If no changes, show a message instead of diff
      if (result.edited_content === contentToEdit) {
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
