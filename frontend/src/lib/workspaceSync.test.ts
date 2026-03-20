import { beforeEach, describe, expect, it, vi } from "vitest";

import { notesDB } from "@/lib/indexedDB";

vi.mock("@/lib/indexedDB", () => ({
  notesDB: {
    saveNotes: vi.fn(),
    saveFolders: vi.fn(),
    deleteNote: vi.fn(),
    deleteFolder: vi.fn(),
  },
}));

import {
  getWorkspaceCursor,
  getWorkspaceDeviceId,
  getWorkspaceSyncRequestMetadata,
  persistWorkspaceSnapshot,
} from "./workspaceSync";

describe("workspaceSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.mocked(notesDB.saveNotes).mockResolvedValue();
    vi.mocked(notesDB.saveFolders).mockResolvedValue();
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
