import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import type { Folder } from "@/types";

const getApiMock = vi.fn();
const dispatchWorkspaceSyncedMock = vi.fn();
const getWorkspaceSyncRequestMetadataMock = vi.fn(() => ({
  device_id: "device-1",
  base_cursor: "cursor-1",
}));

vi.mock("./useApi", () => ({
  useApi: () => ({
    getApi: getApiMock,
  }),
}));

vi.mock("@/lib/indexedDB", () => ({
  notesDB: {
    saveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    saveFolders: vi.fn(),
    saveNotes: vi.fn(),
    deleteNote: vi.fn(),
  },
}));

vi.mock("@/lib/syncQueue", () => ({
  syncQueue: {
    addChange: vi.fn(),
  },
}));

vi.mock("@/lib/workspaceSync", () => ({
  persistWorkspaceSnapshot: vi.fn().mockResolvedValue(undefined),
  dispatchWorkspaceSynced: (...args: unknown[]) => dispatchWorkspaceSyncedMock(...args),
  getWorkspaceSyncRequestMetadata: () => getWorkspaceSyncRequestMetadataMock(),
}));

import { useFolders } from "./useFolders";

function buildFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: overrides.id ?? "folder-1",
    name: overrides.name ?? "Folder",
    user_id: overrides.user_id ?? "user-1",
    version: overrides.version ?? 1,
    created_at: overrides.created_at ?? "2024-01-01T00:00:00.000Z",
    updated_at: overrides.updated_at ?? "2024-01-01T00:00:00.000Z",
    deleted_at: overrides.deleted_at ?? null,
  };
}

function useFoldersHarness(
  initialFolders: Folder[],
  initialSelectedFolderId: string | null = null
) {
  const [folders, setFolders] = useState(initialFolders);
  const [selectedFolderId, setSelectedFolderId] = useState(initialSelectedFolderId);

  return {
    folders,
    selectedFolderId,
    ...useFolders(folders, setFolders, selectedFolderId, setSelectedFolderId),
  };
}

describe("useFolders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(notesDB.saveFolder).mockResolvedValue();
    vi.mocked(notesDB.deleteFolder).mockResolvedValue();
    vi.mocked(notesDB.saveFolders).mockResolvedValue();
    vi.mocked(notesDB.saveNotes).mockResolvedValue();
    vi.mocked(notesDB.deleteNote).mockResolvedValue();
    vi.mocked(syncQueue.addChange).mockResolvedValue();
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("creates a temp folder locally and replaces it from the workspace snapshot", async () => {
    const serverFolder = buildFolder({ id: "folder-server", name: "Projects" });

    getApiMock.mockResolvedValue({
      applyWorkspaceChanges: vi.fn().mockResolvedValue({
        applied: [
          {
            entity: "folder",
            operation: "create",
            entity_id: serverFolder.id,
            client_mutation_id: null,
            folder: serverFolder,
            note: null,
          },
        ],
        snapshot: {
          folders: [serverFolder],
          notes: [],
          cursor: "cursor-1",
          server_time: "2024-01-01T00:00:00.000Z",
        },
      }),
    });

    const { result } = renderHook(() => useFoldersHarness([]));

    await act(async () => {
      await result.current.handleCreateFolder("Projects");
    });

    await waitFor(() => {
      expect(dispatchWorkspaceSyncedMock).toHaveBeenCalledWith({
        snapshot: {
          folders: [serverFolder],
          notes: [],
          cursor: "cursor-1",
          server_time: "2024-01-01T00:00:00.000Z",
        },
      });
    });

    expect(result.current.folders[0]?.name).toBe("Projects");
    expect(notesDB.deleteFolder).toHaveBeenCalledWith(expect.stringMatching(/^temp-/));
  });

  it("queues offline folder renames with expected version", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const initialFolder = buildFolder();
    const { result } = renderHook(() => useFoldersHarness([initialFolder]));

    await act(async () => {
      await result.current.handleRenameFolder(initialFolder.id, "Renamed");
    });

    expect(result.current.folders[0]?.name).toBe("Renamed");
    expect(syncQueue.addChange).toHaveBeenCalledWith(
      "update",
      "folder",
      initialFolder.id,
      { name: "Renamed" },
      { expectedVersion: initialFolder.version }
    );
  });

  it("queues folder deletes and clears selection", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const initialFolder = buildFolder();
    const { result } = renderHook(() =>
      useFoldersHarness([initialFolder], initialFolder.id)
    );

    await act(async () => {
      await result.current.handleDeleteFolder(initialFolder.id);
    });

    expect(result.current.folders).toEqual([]);
    expect(result.current.selectedFolderId).toBeNull();
    expect(syncQueue.addChange).toHaveBeenCalledWith(
      "delete",
      "folder",
      initialFolder.id,
      undefined,
      { expectedVersion: initialFolder.version }
    );
  });
});
