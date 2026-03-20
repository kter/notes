import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { notesDB } from "@/lib/indexedDB";

const getApiMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("./useApi", () => ({
  useApi: () => ({
    getApi: getApiMock,
  }),
}));

vi.mock("@/lib/indexedDB", () => ({
  notesDB: {
    getAllFolders: vi.fn(),
    getAllNotes: vi.fn(),
    saveFolders: vi.fn(),
    saveNotes: vi.fn(),
  },
}));

import { useHomeData } from "./useHomeData";

describe("useHomeData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isLoading: false });
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  it("hydrates from IndexedDB first and then refreshes from the API", async () => {
    const localFolders = [
      {
        id: "folder-1",
        name: "Local folder",
        user_id: "user-1",
        version: 1,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        deleted_at: null,
      },
    ];
    const localNotes = [
      {
        id: "note-1",
        title: "Local title",
        content: "Local content",
        user_id: "user-1",
        folder_id: "folder-1",
        version: 1,
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        deleted_at: null,
      },
    ];
    const serverFolders = [
      {
        ...localFolders[0],
        name: "Server folder",
        updated_at: "2024-01-02T00:00:00.000Z",
      },
    ];
    const serverNotes = [
      {
        ...localNotes[0],
        title: "Server title",
        updated_at: "2024-01-02T00:00:00.000Z",
      },
    ];

    vi.mocked(notesDB.getAllFolders).mockResolvedValue(localFolders);
    vi.mocked(notesDB.getAllNotes).mockResolvedValue(localNotes);
    vi.mocked(notesDB.saveFolders).mockResolvedValue();
    vi.mocked(notesDB.saveNotes).mockResolvedValue();
    getApiMock.mockResolvedValue({
      getWorkspaceSnapshot: vi.fn().mockResolvedValue({
        folders: serverFolders,
        notes: serverNotes,
        cursor: "cursor-1",
        server_time: "2024-01-02T00:00:00.000Z",
      }),
    });

    const { result, rerender } = renderHook(
      ({ isAuthenticated }) => useHomeData(isAuthenticated),
      { initialProps: { isAuthenticated: true } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.folders).toEqual(serverFolders);
      expect(result.current.notes).toEqual(serverNotes);
    });

    rerender({ isAuthenticated: true });

    expect(getApiMock).toHaveBeenCalledTimes(1);
    expect(notesDB.saveFolders).toHaveBeenCalledWith(serverFolders);
    expect(notesDB.saveNotes).toHaveBeenCalledWith(serverNotes);
  });

  it("stops loading immediately when the user is unauthenticated", async () => {
    const { result } = renderHook(() => useHomeData(false));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getApiMock).not.toHaveBeenCalled();
    expect(notesDB.getAllFolders).not.toHaveBeenCalled();
    expect(notesDB.getAllNotes).not.toHaveBeenCalled();
  });
});
