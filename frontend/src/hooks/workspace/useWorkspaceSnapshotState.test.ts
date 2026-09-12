import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Folder, Note } from "@/types";

const getApiMock = vi.fn();
const getWorkspaceCursorMock = vi.fn<() => string | null>();

vi.mock("@/hooks/useApi", () => ({
  useApi: () => ({ getApi: getApiMock }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ isLoading: false }),
}));

vi.mock("@/lib/indexedDB", () => ({
  notesDB: {
    getAllFolders: vi.fn(),
    getAllNotes: vi.fn(),
  },
}));

vi.mock("@/lib/workspaceSync", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workspaceSync")>(
    "@/lib/workspaceSync"
  );
  return {
    ...actual,
    getWorkspaceCursor: () => getWorkspaceCursorMock(),
    persistWorkspaceSnapshot: vi.fn().mockResolvedValue(undefined),
  };
});

import { notesDB } from "@/lib/indexedDB";
import { useWorkspaceSnapshotState } from "./useWorkspaceSnapshotState";

function buildNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1",
    title: "Note",
    content: "Body",
    snippet: "Body",
    user_id: "user-1",
    folder_id: null,
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  } as Note;
}

function buildFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: "folder-1",
    name: "Folder",
    user_id: "user-1",
    version: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...overrides,
  } as Folder;
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("useWorkspaceSnapshotState", () => {
  let getWorkspaceSnapshot: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setOnline(true);
    getWorkspaceSnapshot = vi.fn().mockResolvedValue({
      folders: [],
      notes: [],
      cursor: "c2",
      server_time: "2026-01-01T00:00:00Z",
    });
    getApiMock.mockResolvedValue({ getWorkspaceSnapshot });
    vi.mocked(notesDB.getAllFolders).mockResolvedValue([]);
    vi.mocked(notesDB.getAllNotes).mockResolvedValue([]);
    getWorkspaceCursorMock.mockReturnValue(null);
  });

  it("requests a full snapshot on a first visit", async () => {
    renderHook(() => useWorkspaceSnapshotState(true));

    await waitFor(() => expect(getWorkspaceSnapshot).toHaveBeenCalled());
    expect(getWorkspaceSnapshot).toHaveBeenCalledWith(undefined);
  });

  it("requests a delta when a cursor and a local cache both exist", async () => {
    vi.mocked(notesDB.getAllNotes).mockResolvedValue([buildNote()]);
    getWorkspaceCursorMock.mockReturnValue("c1");

    renderHook(() => useWorkspaceSnapshotState(true));

    await waitFor(() => expect(getWorkspaceSnapshot).toHaveBeenCalled());
    expect(getWorkspaceSnapshot).toHaveBeenCalledWith("c1");
  });

  it("falls back to a full snapshot when the cursor is stale but the cache is empty", async () => {
    // 回帰: カーソルだけ残ってキャッシュが消えている状態で差分を取ると
    // 表示が空のままになる。
    getWorkspaceCursorMock.mockReturnValue("c1");

    renderHook(() => useWorkspaceSnapshotState(true));

    await waitFor(() => expect(getWorkspaceSnapshot).toHaveBeenCalled());
    expect(getWorkspaceSnapshot).toHaveBeenCalledWith(undefined);
  });

  it("shows the local cache and never calls the server while offline", async () => {
    setOnline(false);
    vi.mocked(notesDB.getAllFolders).mockResolvedValue([buildFolder()]);
    vi.mocked(notesDB.getAllNotes).mockResolvedValue([buildNote()]);
    getWorkspaceCursorMock.mockReturnValue("c1");

    const { result } = renderHook(() => useWorkspaceSnapshotState(true));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getWorkspaceSnapshot).not.toHaveBeenCalled();
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.folders).toHaveLength(1);
  });

  it("does not load anything when unauthenticated", async () => {
    const { result } = renderHook(() => useWorkspaceSnapshotState(false));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getWorkspaceSnapshot).not.toHaveBeenCalled();
    expect(notesDB.getAllNotes).not.toHaveBeenCalled();
  });

  it("removes a tombstoned note when applying a delta", async () => {
    vi.mocked(notesDB.getAllNotes).mockResolvedValue([
      buildNote({ id: "note-1" }),
      buildNote({ id: "note-2" }),
    ]);
    getWorkspaceCursorMock.mockReturnValue("c1");
    getWorkspaceSnapshot.mockResolvedValue({
      folders: [],
      notes: [buildNote({ id: "note-2", version: 2, deleted_at: "2026-01-02T00:00:00Z" })],
      cursor: "c2",
      server_time: "2026-01-02T00:00:00Z",
    });

    const { result } = renderHook(() => useWorkspaceSnapshotState(true));

    await waitFor(() => expect(result.current.notes.map((n) => n.id)).toEqual(["note-1"]));
  });
});
