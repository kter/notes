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
  },
}));

function buildChange(overrides: Partial<PendingChange> = {}): PendingChange {
  return {
    id: overrides.id ?? "change-1",
    type: overrides.type ?? "update",
    entityType: overrides.entityType ?? "note",
    entityId: overrides.entityId ?? "note-1",
    data: overrides.data ?? { content: "content" },
    timestamp: overrides.timestamp ?? 1,
  };
}

describe("syncQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
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
      createNote: vi.fn(),
      updateNote: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(404, "Not Found", { detail: "missing" })),
      deleteNote: vi.fn().mockResolvedValue(undefined),
    };

    const result = await syncQueue.processQueue(apiClient);

    expect(notesDB.removePendingChange).toHaveBeenNthCalledWith(1, "change-404");
    expect(notesDB.removePendingChange).toHaveBeenNthCalledWith(2, "change-success");
    expect(result).toEqual({
      success: true,
      syncedCount: 1,
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
      createNote: vi.fn(),
      updateNote: vi
        .fn()
        .mockRejectedValueOnce(new ApiError(429, "Too Many Requests", { detail: "retry later" })),
      deleteNote: vi.fn(),
    };

    const result = await syncQueue.processQueue(apiClient);

    expect(notesDB.removePendingChange).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
    expect(result.errors).toHaveLength(1);
  });
});
