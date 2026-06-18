import { renderHook, act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getApiMock = vi.fn();

vi.mock("./useApi", () => ({
  useApi: () => ({
    getApi: getApiMock,
  }),
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useAIChat } from "./useAIChat";

describe("useAIChat async jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a summarize job, polls it, and appends the result", async () => {
    const createSummarizeJob = vi.fn().mockResolvedValue({
      id: "job-1",
      kind: "summarize",
      status: "completed",
      result: "A short summary",
      error_message: null,
      tokens_used: 42,
    });
    const getAIJob = vi.fn();
    getApiMock.mockResolvedValue({ createSummarizeJob, getAIJob });

    const onTokenUsage = vi.fn();
    const { result } = renderHook(() => useAIChat(onTokenUsage));

    await act(async () => {
      await result.current.handleSummarize("note-1");
    });

    expect(createSummarizeJob).toHaveBeenCalledWith({ note_id: "note-1" });
    expect(onTokenUsage).toHaveBeenCalledWith(42);
    await waitFor(() => {
      expect(result.current.chatMessages).toEqual([
        { role: "assistant", content: "A short summary" },
      ]);
    });
  });

  it("creates a chat job and appends question + answer", async () => {
    const createChatJob = vi.fn().mockResolvedValue({
      id: "job-2",
      kind: "chat",
      status: "completed",
      result: "The answer",
      error_message: null,
      tokens_used: 10,
    });
    getApiMock.mockResolvedValue({ createChatJob, getAIJob: vi.fn() });

    const { result } = renderHook(() => useAIChat());

    await act(async () => {
      await result.current.handleSendMessage("My question", "note", "note-1");
    });

    expect(createChatJob).toHaveBeenCalledWith(
      expect.objectContaining({ question: "My question", scope: "note" })
    );
    await waitFor(() => {
      expect(result.current.chatMessages).toEqual([
        { role: "user", content: "My question" },
        { role: "assistant", content: "The answer" },
      ]);
    });
  });

  it("polls a pending job until it completes", async () => {
    vi.useFakeTimers();
    try {
      const createSummarizeJob = vi.fn().mockResolvedValue({
        id: "job-3",
        kind: "summarize",
        status: "pending",
        result: null,
        error_message: null,
        tokens_used: 0,
      });
      const getAIJob = vi.fn().mockResolvedValue({
        id: "job-3",
        kind: "summarize",
        status: "completed",
        result: "Polled summary",
        error_message: null,
        tokens_used: 5,
      });
      getApiMock.mockResolvedValue({ createSummarizeJob, getAIJob });

      const { result } = renderHook(() => useAIChat());

      let done: Promise<void>;
      act(() => {
        done = result.current.handleSummarize("note-1");
      });

      // ポーリング間隔を進めて完了状態を取得させる
      await vi.advanceTimersByTimeAsync(1600);
      await act(async () => {
        await done;
      });

      expect(getAIJob).toHaveBeenCalledWith("job-3");
      expect(result.current.chatMessages).toEqual([
        { role: "assistant", content: "Polled summary" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
