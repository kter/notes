import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import { calculateHash } from "@/lib/utils";
import type { Note } from "@/types";

const getApiMock = vi.fn();
const getWorkspaceSyncRequestMetadataMock = vi.fn(() => ({
  device_id: "device-1",
  base_cursor: "cursor-1",
}));
const persistWorkspaceSnapshotMock = vi.fn().mockResolvedValue(undefined);
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

vi.mock("@/lib/workspaceSync", () => ({
  persistWorkspaceSnapshot: (...args: unknown[]) => persistWorkspaceSnapshotMock(...args),
  getWorkspaceSyncRequestMetadata: () => getWorkspaceSyncRequestMetadataMock(),
}));

import { useNotes } from "./useNotes";

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

function useNotesHarness(
  initialNotes: Note[],
  selectedFolderId: string | null = null,
  initialSelectedNoteId: string | null = null
) {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedNoteId, setSelectedNoteId] = useState(initialSelectedNoteId);

  return {
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

  it("creates a temp note locally and replaces it with the server note", async () => {
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

    const { result } = renderHook(() => useNotesHarness([], "folder-1"));

    await act(async () => {
      await result.current.handleCreateNote();
    });

    await waitFor(() => {
    expect(result.current.notes).toEqual([serverNote]);
      expect(result.current.selectedNoteId).toBe("server-note-1");
    });

    expect(notesDB.saveNote).toHaveBeenCalledTimes(1);
    expect(persistWorkspaceSnapshotMock).toHaveBeenCalledWith({
      folders: [],
      notes: [serverNote],
      cursor: "cursor-1",
      server_time: "2024-01-01T00:00:00.000Z",
    });
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
    const applyWorkspaceChangesMock = vi.fn().mockResolvedValue({
      applied: [
        {
          entity: "note",
          operation: "update",
          entity_id: initialNote.id,
          client_mutation_id: null,
          folder: null,
          note: serverNote,
        },
      ],
      snapshot: {
        folders: [],
        notes: [serverNote],
        cursor: "cursor-1",
        server_time: "2024-01-02T00:00:00.000Z",
      },
    });

    getApiMock.mockResolvedValue({
      applyWorkspaceChanges: applyWorkspaceChangesMock,
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

    expect(applyWorkspaceChangesMock).toHaveBeenCalledWith({
      device_id: "device-1",
      base_cursor: "cursor-1",
      changes: [
        {
          entity: "note",
          operation: "update",
          entity_id: initialNote.id,
          expected_version: initialNote.version,
          payload: { content: "Updated content" },
        },
      ],
    });
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

    expect(syncQueue.addChange).toHaveBeenCalledWith(
      "update",
      "note",
      initialNote.id,
      { content: "Offline update" },
      { expectedVersion: initialNote.version }
    );
    expect(result.current.syncStatus.remote).toBe("failed");
    expect(result.current.syncStatus.lastError).toBe("Cannot sync while offline");

    vi.useRealTimers();
  });
});
