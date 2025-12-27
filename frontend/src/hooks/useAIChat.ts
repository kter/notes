"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { ChatMessage } from "@/types";

interface UseAIChatReturn {
  chatMessages: ChatMessage[];
  summary: string | null;
  isAILoading: boolean;
  handleSummarize: (noteId: string) => Promise<void>;
  handleSendMessage: (message: string) => Promise<void>;
  clearChat: () => void;
  clearSummary: () => void;
}

export function useAIChat(
  getAccessToken: () => Promise<string | null>,
  selectedNoteId: string | null
): UseAIChatReturn {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [isAILoading, setIsAILoading] = useState(false);

  // Clear chat when note changes
  useEffect(() => {
    setChatMessages([]);
    setSummary(null);
  }, [selectedNoteId]);

  const handleSummarize = async (noteId: string) => {
    setIsAILoading(true);
    setSummary(null);
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      const result = await api.summarizeNote({ note_id: noteId });
      setSummary(result.summary);
    } catch (error) {
      console.error("Failed to summarize:", error);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!selectedNoteId) return;

    const userMessage: ChatMessage = { role: "user", content: message };
    setChatMessages((prev) => [...prev, userMessage]);
    setIsAILoading(true);

    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      const result = await api.chatWithNote({
        note_id: selectedNoteId,
        question: message,
        history: chatMessages,
      });
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: result.answer,
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Failed to chat:", error);
    } finally {
      setIsAILoading(false);
    }
  };

  const clearChat = () => {
    setChatMessages([]);
  };

  const clearSummary = () => {
    setSummary(null);
  };

  return {
    chatMessages,
    summary,
    isAILoading,
    handleSummarize,
    handleSendMessage,
    clearChat,
    clearSummary,
  };
}
