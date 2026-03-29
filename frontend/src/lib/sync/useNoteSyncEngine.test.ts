import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import { calculateHash } from "@/lib/utils";
import type { Note } from "@/types";

const getApiMock = vi.fn();
const getWorkspaceSyncRequestMetadataMock = vi.fn(() => ({
  device_id: "device-1",
  base_cursor: "cursor-1",
}));
const translationMap = {
  "sync.serverSyncFailed": "Failed to sync with the server",
  "sync.offlineSyncUnavailable": "Cannot sync while offline",
  "sync.localSaveFailed": "Failed to save locally",
  "sync.conflictReloaded": "Conflict reloaded",
  "sync.retryingIn": "Retrying in {{seconds}}s...",
} as const;
const refreshWorkspaceSnapshotMock = vi.fn();
const onSnapshotSyncedMock = vi.fn();

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

vi.mock("@/lib/workspaceSync", () => ({
  persistWorkspaceSnapshot: vi.fn().mockResolvedValue(undefined),
  refreshWorkspaceSnapshot: (...args: unknown[]) =>
    refreshWorkspaceSnapshotMock(...args),
  isConflictApiError: (error: unknown) =>
    error instanceof ApiError && error.status === 409,
  getWorkspaceSyncRequestMetadata: () => getWorkspaceSyncRequestMetadataMock(),
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
    setSelectedNoteId,
    ...useNoteSyncEngine({
      setNotes,
      selectedFolderId,
      selectedNoteId,
      setSelectedNoteId,
      onSnapshotSynced: onSnapshotSyncedMock,
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
    onSnapshotSyncedMock.mockReset();
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

    expect(onSnapshotSyncedMock).toHaveBeenCalledWith({
      folders: [],
      notes: [serverNote],
      cursor: "cursor-1",
      server_time: "2024-01-01T00:00:00.000Z",
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

  it("applies the synced snapshot after an online update succeeds", async () => {
    vi.useFakeTimers();

    const initialNote = buildNote();
    const updatedServerNote = buildNote({
      content: "Server update",
      version: 2,
      updated_at: "2024-01-02T00:00:00.000Z",
    });
    const snapshot = {
      folders: [],
      notes: [updatedServerNote],
      cursor: "cursor-2",
      server_time: "2024-01-02T00:00:00.000Z",
    };

    getApiMock.mockResolvedValue({
      applyWorkspaceChanges: vi.fn().mockResolvedValue({
        applied: [
          {
            entity: "note",
            operation: "update",
            entity_id: updatedServerNote.id,
            client_mutation_id: null,
            folder: null,
            note: updatedServerNote,
          },
        ],
        snapshot,
      }),
    });

    const { result } = renderHook(() =>
      useNoteSyncEngineHarness([initialNote], null, initialNote.id)
    );

    await act(async () => {
      await result.current.handleUpdateNote(initialNote.id, {
        content: "Local update",
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await result.current.triggerServerSync(initialNote.id);
    });

    expect(onSnapshotSyncedMock).toHaveBeenCalledWith(snapshot);
    expect(result.current.syncStatus.remote).toBe("synced");

    vi.useRealTimers();
  });

  it("keeps the last acknowledged version across rapid debounced edits", async () => {
    vi.useFakeTimers();

    const initialNote = buildNote();
    const serverNote = buildNote({
      content: "second draft",
      version: 2,
      updated_at: "2024-01-02T00:00:00.000Z",
    });
    const applyWorkspaceChanges = vi.fn().mockResolvedValue({
      applied: [
        {
          entity: "note",
          operation: "update",
          entity_id: serverNote.id,
          client_mutation_id: null,
          folder: null,
          note: serverNote,
        },
      ],
      snapshot: {
        folders: [],
        notes: [serverNote],
        cursor: "cursor-2",
        server_time: "2024-01-02T00:00:00.000Z",
      },
    });
    getApiMock.mockResolvedValue({ applyWorkspaceChanges });

    const { result } = renderHook(() =>
      useNoteSyncEngineHarness([initialNote], null, initialNote.id)
    );

    await act(async () => {
      await result.current.handleUpdateNote(initialNote.id, {
        content: "first draft",
      });
    });

    await act(async () => {
      await result.current.handleUpdateNote(initialNote.id, {
        content: "second draft",
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await result.current.triggerServerSync(initialNote.id);
    });

    expect(applyWorkspaceChanges).toHaveBeenCalledTimes(1);
    expect(applyWorkspaceChanges).toHaveBeenCalledWith({
      device_id: "device-1",
      base_cursor: "cursor-1",
      changes: [
        {
          entity: "note",
          operation: "update",
          entity_id: initialNote.id,
          expected_version: 1,
          payload: { content: "second draft" },
        },
      ],
    });
    expect(result.current.syncStatus.remote).toBe("synced");

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

  it("refreshes the workspace snapshot when an online update conflicts", async () => {
    const initialNote = buildNote();
    const applyWorkspaceChanges = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, "Conflict", { detail: "stale version" }));
    const apiClient = {
      applyWorkspaceChanges,
      getWorkspaceSnapshot: vi.fn(),
    };
    getApiMock.mockResolvedValue(apiClient);
    refreshWorkspaceSnapshotMock.mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useNoteSyncEngineHarness([initialNote], null, initialNote.id)
    );

    await act(async () => {
      await result.current.handleUpdateNote(initialNote.id, {
        content: "Conflict update",
      });
    });

    await act(async () => {
      await result.current.triggerServerSync(initialNote.id);
    });

    await waitFor(() => {
      expect(refreshWorkspaceSnapshotMock).toHaveBeenCalledWith(apiClient, {
        onSnapshotSynced: onSnapshotSyncedMock,
      });
    });

    expect(syncQueue.addChange).not.toHaveBeenCalled();
    expect(result.current.syncStatus.remote).toBe("failed");
    expect(result.current.syncStatus.lastError).toBe("Conflict reloaded");
  });

  describe("retry behavior", () => {
    it("fires a first retry after 2s on server failure, then succeeds", async () => {
      vi.useFakeTimers();

      const initialNote = buildNote();
      const updatedServerNote = buildNote({ content: "Synced", version: 2 });
      const snapshot = {
        folders: [],
        notes: [updatedServerNote],
        cursor: "cursor-2",
        server_time: "2024-01-02T00:00:00.000Z",
      };
      const applyWorkspaceChanges = vi
        .fn()
        .mockRejectedValueOnce(new Error("Server error"))
        .mockResolvedValueOnce({
          applied: [{ entity: "note", operation: "update", entity_id: initialNote.id, client_mutation_id: null, folder: null, note: updatedServerNote }],
          snapshot,
        });
      getApiMock.mockResolvedValue({ applyWorkspaceChanges });

      const { result } = renderHook(() =>
        useNoteSyncEngineHarness([initialNote], null, initialNote.id)
      );

      await act(async () => {
        await result.current.handleUpdateNote(initialNote.id, { content: "New content" });
      });

      // Advance past debounce (5s) to trigger first sync attempt
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        await result.current.triggerServerSync(initialNote.id);
      });

      // After failure, retryCountdown should be set to 2
      expect(result.current.syncStatus.remote).toBe("failed");
      expect(result.current.syncStatus.retryCountdown).toBe(2);

      // Advance 1s — countdown ticks to 1
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(result.current.syncStatus.retryCountdown).toBe(1);

      // Advance another 1s — retry fires, countdown clears
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(result.current.syncStatus.remote).toBe("synced");
      expect(result.current.syncStatus.retryCountdown).toBeUndefined();
      expect(applyWorkspaceChanges).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("countdown decrements each second after failure", async () => {
      vi.useFakeTimers();

      const initialNote = buildNote();
      const applyWorkspaceChanges = vi.fn().mockRejectedValue(new Error("Server error"));
      getApiMock.mockResolvedValue({ applyWorkspaceChanges });

      const { result } = renderHook(() =>
        useNoteSyncEngineHarness([initialNote], null, initialNote.id)
      );

      await act(async () => {
        await result.current.handleUpdateNote(initialNote.id, { content: "edit" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        await result.current.triggerServerSync(initialNote.id);
      });

      expect(result.current.syncStatus.retryCountdown).toBe(2);

      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(result.current.syncStatus.retryCountdown).toBe(1);

      // At 2s: retry fires, fails, sets countdown for next attempt (4s)
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(result.current.syncStatus.retryCountdown).toBe(4);

      vi.useRealTimers();
    });

    it("uses exponential backoff delays: 2s, 4s, 8s", async () => {
      vi.useFakeTimers();

      const initialNote = buildNote();
      const applyWorkspaceChanges = vi.fn().mockRejectedValue(new Error("Server error"));
      getApiMock.mockResolvedValue({ applyWorkspaceChanges });

      const { result } = renderHook(() =>
        useNoteSyncEngineHarness([initialNote], null, initialNote.id)
      );

      await act(async () => {
        await result.current.handleUpdateNote(initialNote.id, { content: "edit" });
      });

      // First call via debounce
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        await result.current.triggerServerSync(initialNote.id);
      });
      expect(result.current.syncStatus.retryCountdown).toBe(2);
      expect(applyWorkspaceChanges).toHaveBeenCalledTimes(1);

      // Retry attempt 0 → fires after 2s, next delay 4s
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(result.current.syncStatus.retryCountdown).toBe(4);
      expect(applyWorkspaceChanges).toHaveBeenCalledTimes(2);

      // Retry attempt 1 → fires after 4s, next delay 8s
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(result.current.syncStatus.retryCountdown).toBe(8);
      expect(applyWorkspaceChanges).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });

    it("exhausts after maxRetryAttempts and stays failed with no countdown", async () => {
      vi.useFakeTimers();

      const initialNote = buildNote();
      const applyWorkspaceChanges = vi.fn().mockRejectedValue(new Error("Server error"));
      getApiMock.mockResolvedValue({ applyWorkspaceChanges });

      const { result } = renderHook(() =>
        useNoteSyncEngineHarness([initialNote], null, initialNote.id)
      );

      await act(async () => {
        await result.current.handleUpdateNote(initialNote.id, { content: "edit" });
      });

      // Initial call
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        await result.current.triggerServerSync(initialNote.id);
      });
      expect(result.current.syncStatus.retryCountdown).toBe(2);

      // Attempt 0 (2s delay)
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(result.current.syncStatus.retryCountdown).toBe(4);

      // Attempt 1 (4s delay)
      await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
      expect(result.current.syncStatus.retryCountdown).toBe(8);

      // Attempt 2 (8s delay) — last attempt (maxRetryAttempts = 3)
      await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
      expect(result.current.syncStatus.remote).toBe("failed");
      expect(result.current.syncStatus.retryCountdown).toBeUndefined();

      // 1 initial + 3 retries = 4 total calls
      expect(applyWorkspaceChanges).toHaveBeenCalledTimes(4);

      vi.useRealTimers();
    });

    it("cancels pending retry when a new edit is made", async () => {
      vi.useFakeTimers();

      const initialNote = buildNote();
      const updatedServerNote = buildNote({ content: "New edit synced", version: 2 });
      const applyWorkspaceChanges = vi
        .fn()
        .mockRejectedValueOnce(new Error("Server error"))
        .mockResolvedValue({
          applied: [{ entity: "note", operation: "update", entity_id: initialNote.id, client_mutation_id: null, folder: null, note: updatedServerNote }],
          snapshot: { folders: [], notes: [updatedServerNote], cursor: "cursor-2", server_time: "2024-01-02T00:00:00.000Z" },
        });
      getApiMock.mockResolvedValue({ applyWorkspaceChanges });

      const { result } = renderHook(() =>
        useNoteSyncEngineHarness([initialNote], null, initialNote.id)
      );

      // First edit → debounce → fail → countdown starts
      await act(async () => {
        await result.current.handleUpdateNote(initialNote.id, { content: "edit 1" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        await result.current.triggerServerSync(initialNote.id);
      });
      expect(result.current.syncStatus.retryCountdown).toBe(2);

      // New edit cancels retry
      await act(async () => {
        await result.current.handleUpdateNote(initialNote.id, { content: "edit 2" });
      });

      expect(result.current.syncStatus.retryCountdown).toBeUndefined();

      // Advance well past the old retry delay — old retry should NOT fire
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      // Only the initial failed call; no retry from old countdown
      expect(applyWorkspaceChanges).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("cancels pending retry on note switch", async () => {
      vi.useFakeTimers();

      const initialNote = buildNote({ id: "note-1" });
      const applyWorkspaceChanges = vi.fn().mockRejectedValue(new Error("Server error"));
      getApiMock.mockResolvedValue({ applyWorkspaceChanges });

      const { result } = renderHook(() =>
        useNoteSyncEngineHarness([initialNote], null, "note-1")
      );

      await act(async () => {
        await result.current.handleUpdateNote(initialNote.id, { content: "edit" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        await result.current.triggerServerSync(initialNote.id);
      });
      expect(result.current.syncStatus.retryCountdown).toBe(2);

      // Switch note — triggers useEffect([selectedNoteId]) which cancels retry
      await act(async () => {
        result.current.setSelectedNoteId("note-2");
      });
      expect(result.current.syncStatus.retryCountdown).toBeUndefined();

      // Advance past retry delay — retry should NOT fire
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(applyWorkspaceChanges).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("does not retry on conflict errors (409)", async () => {
      vi.useFakeTimers();

      const initialNote = buildNote();
      const applyWorkspaceChanges = vi
        .fn()
        .mockRejectedValueOnce(new ApiError(409, "Conflict", { detail: "stale version" }));
      const apiClient = {
        applyWorkspaceChanges,
        getWorkspaceSnapshot: vi.fn(),
      };
      getApiMock.mockResolvedValue(apiClient);
      refreshWorkspaceSnapshotMock.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useNoteSyncEngineHarness([initialNote], null, initialNote.id)
      );

      await act(async () => {
        await result.current.handleUpdateNote(initialNote.id, { content: "edit" });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
        await result.current.triggerServerSync(initialNote.id);
      });

      expect(result.current.syncStatus.remote).toBe("failed");
      expect(result.current.syncStatus.retryCountdown).toBeUndefined();
      expect(applyWorkspaceChanges).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });
});
