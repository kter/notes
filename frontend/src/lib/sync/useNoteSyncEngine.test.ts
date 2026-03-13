import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import { calculateHash } from "@/lib/utils";
import type { Note } from "@/types";

const getApiMock = vi.fn();

vi.mock("@/hooks/useApi", () => ({
  useApi: () => ({
    getApi: getApiMock,
  }),
}));

vi.mock("@/lib/indexedDB", () => ({
  notesDB: {
    saveNote: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

vi.mock("@/lib/syncQueue", () => ({
  syncQueue: {
    addChange: vi.fn(),
  },
}));

vi.mock("@/lib/utils", () => ({
  calculateHash: vi.fn(),
}));

import { useNoteSyncEngine } from "./useNoteSyncEngine";

function buildNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? "note-1",
    title: overrides.title ?? "Title",
    content: overrides.content ?? "Content",
    user_id: overrides.user_id ?? "user-1",
    folder_id: overrides.folder_id ?? null,
    created_at: overrides.created_at ?? "2024-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2024-01-01T00:00:00.000Z",
  };
}

function useNoteSyncEngineHarness(
  initialNotes: Note[],
  selectedFolderId: string | null = null,
  initialSelectedNoteId: string | null = null
) {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedNoteId, setSelectedNoteId] = useState(initialSelectedNoteId);

  return {
    notes,
    selectedNoteId,
    ...useNoteSyncEngine({
      setNotes,
      selectedFolderId,
      selectedNoteId,
      setSelectedNoteId,
    }),
  };
}

describe("useNoteSyncEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(calculateHash).mockResolvedValue("hash-123");
    vi.mocked(notesDB.saveNote).mockResolvedValue();
    vi.mocked(notesDB.deleteNote).mockResolvedValue();
    vi.mocked(syncQueue.addChange).mockResolvedValue();
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("replaces a temp note with the server note on create", async () => {
    const serverNote = buildNote({
      id: "server-note-1",
      content: "",
      folder_id: "folder-1",
    });

    getApiMock.mockResolvedValue({
      createNote: vi.fn().mockResolvedValue(serverNote),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
    });

    const { result } = renderHook(() =>
      useNoteSyncEngineHarness([], "folder-1")
    );

    await act(async () => {
      await result.current.handleCreateNote();
    });

    await waitFor(() => {
      expect(result.current.notes).toEqual([serverNote]);
      expect(result.current.selectedNoteId).toBe("server-note-1");
    });

    expect(result.current.savedHashes).toEqual({ "server-note-1": "hash-123" });
    expect(result.current.syncStatus.remote).toBe("synced");
  });

  it("queues offline updates when the debounced remote sync runs", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const initialNote = buildNote();
    const { result } = renderHook(() =>
      useNoteSyncEngineHarness([initialNote], null, initialNote.id)
    );

    await act(async () => {
      await result.current.handleUpdateNote(initialNote.id, {
        content: "Offline update",
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(syncQueue.addChange).toHaveBeenCalledWith("update", "note", initialNote.id, {
      content: "Offline update",
    });
    expect(result.current.syncStatus.remote).toBe("failed");

    vi.useRealTimers();
  });
});
