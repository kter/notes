import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./api";
import { syncQueue } from "./syncQueue";
import { notesDB, type PendingChange } from "./indexedDB";

vi.mock("./indexedDB", () => ({
  notesDB: {
    getPendingChanges: vi.fn(),
    addPendingChange: vi.fn(),
    removePendingChange: vi.fn(),
    clearPendingChanges: vi.fn(),
    deleteNote: vi.fn(),
    deleteFolder: vi.fn(),
    saveNotes: vi.fn(),
    saveFolders: vi.fn(),
  },
}));

function buildChange(overrides: Partial<PendingChange> = {}): PendingChange {
  return {
    id: overrides.id ?? "change-1",
    type: overrides.type ?? "update",
    entityType: overrides.entityType ?? "note",
    entityId: overrides.entityId ?? "note-1",
    data: overrides.data ?? { content: "content" },
    expectedVersion: overrides.expectedVersion,
    timestamp: overrides.timestamp ?? 1,
  };
}

describe("syncQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.localStorage.clear();
    window.localStorage.setItem("notes-workspace-device-id", "device-1");
    window.localStorage.setItem("notes-workspace-cursor", "cursor-1");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges create followed by update into one create operation", async () => {
    vi.mocked(notesDB.getPendingChanges).mockResolvedValue([
      buildChange({
        id: "create-1",
        type: "create",
        data: { title: "Draft", content: "Before" },
      }),
    ]);

    await syncQueue.addChange("update", "note", "note-1", { content: "After" });

    expect(notesDB.removePendingChange).toHaveBeenCalledWith("create-1");
    expect(notesDB.addPendingChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "create",
        entityType: "note",
        entityId: "note-1",
        data: { title: "Draft", content: "After" },
      })
    );
  });

  it("drops create followed by delete without enqueueing anything", async () => {
    vi.mocked(notesDB.getPendingChanges).mockResolvedValue([
      buildChange({
        id: "create-1",
        type: "create",
        entityId: "temp-note-1",
      }),
    ]);

    await syncQueue.addChange("delete", "note", "temp-note-1");

    expect(notesDB.removePendingChange).toHaveBeenCalledWith("create-1");
    expect(notesDB.addPendingChange).not.toHaveBeenCalled();
  });

  it("removes permanent client errors from the queue and continues", async () => {
    vi.mocked(notesDB.getPendingChanges).mockResolvedValue([
      buildChange({
        id: "change-404",
        type: "update",
        entityId: "note-missing",
      }),
      buildChange({
        id: "change-success",
        type: "delete",
        entityId: "note-2",
      }),
    ]);

    const apiClient = {
      applyWorkspaceChanges: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(404, "Not Found", { detail: "missing" })),
    };

    const result = await syncQueue.processQueue(apiClient);

    expect(notesDB.removePendingChange).toHaveBeenNthCalledWith(1, "change-404");
    expect(notesDB.removePendingChange).toHaveBeenNthCalledWith(2, "change-success");
    expect(result).toEqual({
      success: true,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    });
  });

  it("keeps transient errors in the queue for retry", async () => {
    vi.mocked(notesDB.getPendingChanges).mockResolvedValue([
      buildChange({
        id: "change-429",
        type: "update",
        entityId: "note-1",
      }),
    ]);

    const apiClient = {
      applyWorkspaceChanges: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(429, "Too Many Requests", { detail: "retry later" })),
    };

    const result = await syncQueue.processQueue(apiClient);

    expect(notesDB.removePendingChange).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it("batches pending changes through workspace changes and persists the snapshot", async () => {
    vi.mocked(notesDB.getPendingChanges).mockResolvedValue([
      buildChange({
        id: "change-create",
        type: "create",
        entityId: "temp-note-1",
        data: { title: "Draft", content: "" },
      }),
      buildChange({
        id: "change-update",
        type: "update",
        entityId: "note-1",
        data: { content: "After" },
        expectedVersion: 3,
      }),
    ]);

    const snapshot = {
      cursor: "cursor-1",
      server_time: "2024-01-01T00:00:00.000Z",
      folders: [],
      notes: [
        {
          id: "note-1",
          title: "Title",
          content: "After",
          user_id: "user-1",
          folder_id: null,
          version: 4,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:01.000Z",
          deleted_at: null,
        },
      ],
    };

    const apiClient = {
      applyWorkspaceChanges: vi.fn().mockResolvedValue({
        applied: [],
        snapshot,
      }),
    };

    const result = await syncQueue.processQueue(apiClient);

    expect(apiClient.applyWorkspaceChanges).toHaveBeenCalledWith({
      device_id: "device-1",
      base_cursor: "cursor-1",
      changes: [
        {
          entity: "note",
          operation: "create",
          entity_id: undefined,
          client_mutation_id: "change-create",
          expected_version: undefined,
          payload: { title: "Draft", content: "" },
        },
        {
          entity: "note",
          operation: "update",
          entity_id: "note-1",
          client_mutation_id: "change-update",
          expected_version: 3,
          payload: { content: "After" },
        },
      ],
    });
    expect(notesDB.deleteNote).toHaveBeenCalledWith("temp-note-1");
    expect(notesDB.saveNotes).toHaveBeenCalledWith(snapshot.notes);
    expect(result.snapshot).toEqual(snapshot);
    expect(result.syncedCount).toBe(2);
  });
});
