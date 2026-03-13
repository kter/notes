import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import { calculateHash } from "@/lib/utils";
import type { Note } from "@/types";

const getApiMock = vi.fn();
const translationMap = {
  "sync.offlineSyncUnavailable": "Cannot sync while offline",
} as const;

vi.mock("./useApi", () => ({
  useApi: () => ({
    getApi: getApiMock,
  }),
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (key: keyof typeof translationMap) => translationMap[key] ?? key,
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

import { useNotes } from "./useNotes";

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

function useNotesHarness(
  initialNotes: Note[],
  selectedFolderId: string | null = null,
  initialSelectedNoteId: string | null = null
) {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedNoteId, setSelectedNoteId] = useState(initialSelectedNoteId);

  return {
    notes,
    selectedNoteId,
    ...useNotes(notes, setNotes, selectedFolderId, selectedNoteId, setSelectedNoteId),
  };
}

describe("useNotes", () => {
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

  it("creates a temp note locally and replaces it with the server note", async () => {
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

    const { result } = renderHook(() => useNotesHarness([], "folder-1"));

    await act(async () => {
      await result.current.handleCreateNote();
    });

    await waitFor(() => {
      expect(result.current.notes).toEqual([serverNote]);
      expect(result.current.selectedNoteId).toBe("server-note-1");
    });

    expect(notesDB.saveNote).toHaveBeenCalledTimes(2);
    expect(notesDB.deleteNote).toHaveBeenCalledWith(expect.stringMatching(/^temp-/));
    expect(result.current.syncStatus.remote).toBe("synced");
    expect(result.current.savedHashes).toEqual({ "server-note-1": "hash-123" });
  });

  it("saves locally first and syncs the note to the server after the debounce", async () => {
    vi.useFakeTimers();

    const initialNote = buildNote();
    const serverNote = buildNote({
      content: "Updated content",
      updated_at: "2024-01-02T00:00:00.000Z",
    });
    const updateNoteMock = vi.fn().mockResolvedValue(serverNote);

    getApiMock.mockResolvedValue({
      createNote: vi.fn(),
      updateNote: updateNoteMock,
      deleteNote: vi.fn(),
    });

    const { result } = renderHook(() => useNotesHarness([initialNote], null, initialNote.id));

    await act(async () => {
      await result.current.handleUpdateNote(initialNote.id, { content: "Updated content" });
    });

    expect(result.current.notes[0]?.content).toBe("Updated content");
    expect(result.current.syncStatus.remote).toBe("unsynced");
    expect(notesDB.saveNote).toHaveBeenCalledWith(
      expect.objectContaining({
        id: initialNote.id,
        content: "Updated content",
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(updateNoteMock).toHaveBeenCalledWith(initialNote.id, { content: "Updated content" });
    expect(result.current.syncStatus.remote).toBe("synced");

    expect(result.current.notes[0]?.updated_at).toBe("2024-01-02T00:00:00.000Z");
    expect(result.current.savedHashes).toEqual({ [initialNote.id]: "hash-123" });

    vi.useRealTimers();
  });

  it("queues offline edits after the debounce fires", async () => {
    vi.useFakeTimers();

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const initialNote = buildNote();

    const { result } = renderHook(() => useNotesHarness([initialNote], null, initialNote.id));

    await act(async () => {
      await result.current.handleUpdateNote(initialNote.id, { content: "Offline update" });
    });

    expect(result.current.syncStatus.remote).toBe("unsynced");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(syncQueue.addChange).toHaveBeenCalledWith("update", "note", initialNote.id, {
      content: "Offline update",
    });
    expect(result.current.syncStatus.remote).toBe("failed");
    expect(result.current.syncStatus.lastError).toBe("Cannot sync while offline");

    vi.useRealTimers();
  });
});
