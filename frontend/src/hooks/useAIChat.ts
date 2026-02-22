"use client";

import { useState } from "react";
import { useApi } from "./useApi";
import type { ChatMessage } from "@/types";

export type ChatScope = "note" | "folder" | "all";

interface UseAIChatReturn {
  chatMessages: ChatMessage[];
  isAILoading: boolean;
  handleSummarize: (noteId: string) => Promise<void>;
  handleSendMessage: (
    message: string,
    scope: ChatScope,
    noteId?: string | null,
    folderId?: string | null
  ) => Promise<void>;
  clearChat: () => void;
}

export function useAIChat(onTokenUsage?: (tokens: number) => void): UseAIChatReturn {
  const { getApi } = useApi();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);

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
      console.error("Failed to summarize:", error);
      if ((error as { status?: number })?.status === 429) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: "Error: Monthly token limit exceeded. Please try again next month or adjust your settings." }]);
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
      console.error("Failed to chat:", error);
      if ((error as { status?: number })?.status === 429) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: "Error: Monthly token limit exceeded. Please try again next month or adjust your settings." }]);
      }
    } finally {
      setIsAILoading(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
  };

  return {
    chatMessages,
    isAILoading,
    handleSummarize,
    handleSendMessage,
    clearChat,
  };
}
