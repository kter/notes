import { beforeEach, describe, expect, it, vi } from "vitest";

import { notesDB } from "@/lib/indexedDB";

vi.mock("@/lib/indexedDB", () => ({
  notesDB: {
    saveNote: vi.fn(),
    saveNotes: vi.fn(),
    saveFolders: vi.fn(),
    saveFolder: vi.fn(),
    deleteNote: vi.fn(),
    deleteFolder: vi.fn(),
  },
}));

import {
  getWorkspaceCursor,
  getWorkspaceDeviceId,
  getWorkspaceSyncRequestMetadata,
  persistWorkspaceSnapshot,
  persistWorkspaceSnapshotIncremental,
} from "./workspaceSync";
import type { WorkspaceAppliedChange } from "@/types";

describe("workspaceSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(notesDB.saveNote).mockResolvedValue();
    vi.mocked(notesDB.saveNotes).mockResolvedValue();
    vi.mocked(notesDB.saveFolders).mockResolvedValue();
    vi.mocked(notesDB.saveFolder).mockResolvedValue();
    vi.mocked(notesDB.deleteNote).mockResolvedValue();
    vi.mocked(notesDB.deleteFolder).mockResolvedValue();
  });

  it("persists snapshot data and updates the stored cursor", async () => {
    await persistWorkspaceSnapshot({
      folders: [
        {
          id: "folder-1",
          name: "Folder",
          user_id: "user-1",
          version: 1,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
          deleted_at: null,
        },
      ],
      notes: [
        {
          id: "note-1",
          title: "Note",
          content: "Body",
          user_id: "user-1",
          folder_id: null,
          version: 1,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
          deleted_at: null,
        },
        {
          id: "note-deleted",
          title: "Deleted",
          content: "Body",
          user_id: "user-1",
          folder_id: null,
          version: 2,
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
          deleted_at: "2024-01-02T00:00:00.000Z",
        },
      ],
      cursor: "cursor-2",
      server_time: "2024-01-02T00:00:00.000Z",
    });

    expect(notesDB.saveFolders).toHaveBeenCalledWith([
      expect.objectContaining({ id: "folder-1" }),
    ]);
    expect(notesDB.saveNotes).toHaveBeenCalledWith([
      expect.objectContaining({ id: "note-1" }),
    ]);
    expect(notesDB.deleteNote).toHaveBeenCalledWith("note-deleted");
    expect(getWorkspaceCursor()).toBe("cursor-2");
  });

  it("incremental: only writes entities in applied[], updates cursor, leaves others untouched", async () => {
    const applied: WorkspaceAppliedChange[] = [
      {
        entity: "note",
        operation: "update",
        entity_id: "note-1",
        client_mutation_id: null,
        folder: null,
        note: null,
      },
    ];
    await persistWorkspaceSnapshotIncremental(
      {
        folders: [
          {
            id: "folder-untouched",
            name: "Folder",
            user_id: "user-1",
            version: 1,
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        notes: [
          {
            id: "note-1",
            title: "Note",
            content: "Body",
            user_id: "user-1",
            folder_id: null,
            version: 2,
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
            deleted_at: null,
          },
          {
            id: "note-other",
            title: "Other",
            content: "Other body",
            user_id: "user-1",
            folder_id: null,
            version: 1,
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
            deleted_at: null,
          },
        ],
        cursor: "cursor-incremental",
        server_time: "2024-01-02T00:00:00.000Z",
      },
      applied
    );

    expect(notesDB.saveNote).toHaveBeenCalledTimes(1);
    expect(notesDB.saveNote).toHaveBeenCalledWith(expect.objectContaining({ id: "note-1" }));
    expect(notesDB.saveFolder).not.toHaveBeenCalled();
    expect(notesDB.saveFolders).not.toHaveBeenCalled();
    expect(notesDB.saveNotes).not.toHaveBeenCalled();
    expect(getWorkspaceCursor()).toBe("cursor-incremental");
  });

  it("incremental: deletes a note that was soft-deleted in the applied set", async () => {
    const applied: WorkspaceAppliedChange[] = [
      {
        entity: "note",
        operation: "delete",
        entity_id: "note-deleted",
        client_mutation_id: null,
        folder: null,
        note: null,
      },
    ];
    await persistWorkspaceSnapshotIncremental(
      {
        folders: [],
        notes: [
          {
            id: "note-deleted",
            title: "Deleted",
            content: "",
            user_id: "user-1",
            folder_id: null,
            version: 3,
            created_at: "2024-01-01T00:00:00.000Z",
            updated_at: "2024-01-01T00:00:00.000Z",
            deleted_at: "2024-01-02T00:00:00.000Z",
          },
        ],
        cursor: "cursor-del",
        server_time: "2024-01-02T00:00:00.000Z",
      },
      applied
    );

    expect(notesDB.deleteNote).toHaveBeenCalledWith("note-deleted");
    expect(notesDB.saveNote).not.toHaveBeenCalled();
    expect(getWorkspaceCursor()).toBe("cursor-del");
  });

  it("reuses a stored device id and includes the latest cursor", () => {
    window.localStorage.setItem("notes-workspace-device-id", "device-1");
    window.localStorage.setItem("notes-workspace-cursor", "cursor-3");

    expect(getWorkspaceDeviceId()).toBe("device-1");
    expect(getWorkspaceSyncRequestMetadata()).toEqual({
      device_id: "device-1",
      base_cursor: "cursor-3",
    });
  });
});
