import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import { calculateHash } from "@/lib/utils";
import type { Note } from "@/types";

const getApiMock = vi.fn();
const translationMap = {
  "sync.serverSyncFailed": "Failed to sync with the server",
  "sync.offlineSyncUnavailable": "Cannot sync while offline",
  "sync.localSaveFailed": "Failed to save locally",
} as const;

vi.mock("@/hooks/useApi", () => ({
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
    getNote: vi.fn(),
    saveNotes: vi.fn(),
    saveFolders: vi.fn(),
    deleteFolder: vi.fn(),
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
    version: overrides.version ?? 1,
    created_at: overrides.created_at ?? "2024-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2024-01-01T00:00:00.000Z",
    deleted_at: overrides.deleted_at ?? null,
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
    vi.mocked(notesDB.getNote).mockResolvedValue(undefined);
    vi.mocked(notesDB.saveNotes).mockResolvedValue();
    vi.mocked(notesDB.saveFolders).mockResolvedValue();
    vi.mocked(notesDB.deleteFolder).mockResolvedValue();
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
      applyWorkspaceChanges: vi.fn().mockResolvedValue({
        applied: [
          {
            entity: "note",
            operation: "create",
            entity_id: serverNote.id,
            client_mutation_id: null,
            folder: null,
            note: serverNote,
          },
        ],
        snapshot: {
          folders: [],
          notes: [serverNote],
          cursor: "cursor-1",
          server_time: "2024-01-01T00:00:00.000Z",
        },
      }),
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
    }, {
      expectedVersion: 1,
    });
    expect(result.current.syncStatus.remote).toBe("failed");
    expect(result.current.syncStatus.lastError).toBe("Cannot sync while offline");

    vi.useRealTimers();
  });

  it("surfaces translated local save failures", async () => {
    const initialNote = buildNote();
    vi.mocked(notesDB.saveNote).mockRejectedValueOnce(new Error("indexeddb unavailable"));

    const { result } = renderHook(() =>
      useNoteSyncEngineHarness([initialNote], null, initialNote.id)
    );

    await act(async () => {
      await result.current.handleUpdateNote(initialNote.id, {
        content: "Offline update",
      });
    });

    expect(result.current.syncStatus.local).toBe("failed");
    expect(result.current.syncStatus.lastError).toBe("Failed to save locally");
  });
});
