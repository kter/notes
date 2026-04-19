import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useWorkspaceSyncStateMock = vi.fn();
const useFoldersMock = vi.fn();
const useNotesMock = vi.fn();
const useTokenUsageMock = vi.fn();
const useAIChatMock = vi.fn();
const useResizableMock = vi.fn();
const useNoteFilterMock = vi.fn();

vi.mock("./useWorkspaceSyncState", () => ({
  useWorkspaceSyncState: (...args: unknown[]) => useWorkspaceSyncStateMock(...args),
}));

vi.mock("@/hooks/useFolders", () => ({
  useFolders: (...args: unknown[]) => useFoldersMock(...args),
}));

vi.mock("@/hooks/useNotes", () => ({
  useNotes: (...args: unknown[]) => useNotesMock(...args),
}));

vi.mock("@/hooks/useTokenUsage", () => ({
  useTokenUsage: (...args: unknown[]) => useTokenUsageMock(...args),
}));

vi.mock("@/hooks/useAIChat", () => ({
  useAIChat: (...args: unknown[]) => useAIChatMock(...args),
}));

vi.mock("@/hooks/useResizable", () => ({
  useResizable: (...args: unknown[]) => useResizableMock(...args),
}));

vi.mock("@/hooks/useNoteFilter", () => ({
  useNoteFilter: (...args: unknown[]) => useNoteFilterMock(...args),
}));

import { useWorkspaceState } from "./useWorkspaceState";

describe("useWorkspaceState", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useWorkspaceSyncStateMock.mockReturnValue({
      folders: [{ id: "folder-1", name: "Folder 1" }],
      setFolders: vi.fn(),
      notes: [
        {
          id: "note-1",
          title: "Note 1",
          content: "Original content",
          user_id: "user-1",
          folder_id: "folder-1",
          created_at: "2024-01-01T00:00:00.000Z",
          updated_at: "2024-01-01T00:00:00.000Z",
        },
      ],
      setNotes: vi.fn(),
      isLoading: false,
      isOnline: true,
      syncStatus: "idle",
      lastErrorMessage: null,
      pendingChangesCount: 0,
    });
    useFoldersMock.mockReturnValue({
      handleCreateFolder: vi.fn(),
      handleRenameFolder: vi.fn(),
      handleDeleteFolder: vi.fn(),
    });
    useNotesMock.mockReturnValue({
      syncStatus: { local: "saved", remote: "synced", isSaving: false },
      handleCreateNote: vi.fn(),
      handleUpdateNote: vi.fn(),
      handleDeleteNote: vi.fn(),
      triggerServerSync: vi.fn(),
      savedHashes: { "note-1": "hash-1" },
    });
    useTokenUsageMock.mockReturnValue({
      tokenUsage: null,
      recordUsage: vi.fn(),
    });
    useAIChatMock.mockReturnValue({
      chatMessages: [],
      isAILoading: false,
      isEditMode: false,
      setIsEditMode: vi.fn(),
      handleSummarize: vi.fn(),
      handleSendMessage: vi.fn(),
      handleSendEditRequest: vi.fn(),
      handleAcceptEdit: vi.fn(),
      handleRejectEdit: vi.fn(),
      clearChat: vi.fn(),
    });
    useResizableMock.mockReturnValue({
      width: 320,
      isResizing: false,
      handleMouseDown: vi.fn(),
    });
    useNoteFilterMock.mockImplementation((notes) => notes);
  });

  it("moves mobile navigation forward when selecting a folder and note", () => {
    const { result } = renderHook(() => useWorkspaceState(true));

    act(() => {
      result.current.setSearchQuery("python");
      result.current.handleSelectFolder("folder-1");
    });

    expect(result.current.selectedFolderId).toBe("folder-1");
    expect(result.current.searchQuery).toBe("");
    expect(result.current.mobileView).toBe("notes");

    act(() => {
      result.current.handleSelectNote("note-1");
    });

    expect(result.current.selectedNoteId).toBe("note-1");
    expect(result.current.mobileView).toBe("editor");
  });

  it("applies accepted AI edits to the selected note", () => {
    const handleUpdateNote = vi.fn();
    const handleAcceptEdit = vi.fn().mockReturnValue("Edited content");

    useNotesMock.mockReturnValue({
      syncStatus: { local: "saved", remote: "synced", isSaving: false },
      handleCreateNote: vi.fn(),
      handleUpdateNote,
      handleDeleteNote: vi.fn(),
      triggerServerSync: vi.fn(),
      savedHashes: {},
    });
    useAIChatMock.mockReturnValue({
      chatMessages: [
        {
          role: "assistant",
          content: "",
          editProposal: {
            originalContent: "Original content",
            editedContent: "Edited content",
            status: "pending",
          },
        },
      ],
      isAILoading: false,
      isEditMode: true,
      setIsEditMode: vi.fn(),
      handleSummarize: vi.fn(),
      handleSendMessage: vi.fn(),
      handleSendEditRequest: vi.fn(),
      handleAcceptEdit,
      handleRejectEdit: vi.fn(),
      clearChat: vi.fn(),
    });

    const { result } = renderHook(() => useWorkspaceState(true));

    act(() => {
      result.current.handleSelectNote("note-1");
    });

    act(() => {
      result.current.handleAcceptEditAndApply(0);
    });

    expect(handleAcceptEdit).toHaveBeenCalledWith(0);
    expect(handleUpdateNote).toHaveBeenCalledWith("note-1", {
      content: "Edited content",
    });
    expect(result.current.contentOverride).toEqual({
      content: "Edited content",
      version: 1,
    });
  });

  it("tracks editor selected text via handleEditorSelectionChange", () => {
    const { result } = renderHook(() => useWorkspaceState(true));

    expect(result.current.getCurrentEditorSelectedText()).toBe("");

    act(() => {
      result.current.handleEditorSelectionChange("selected text");
    });

    expect(result.current.getCurrentEditorSelectedText()).toBe("selected text");

    act(() => {
      result.current.handleEditorSelectionChange("");
    });

    expect(result.current.getCurrentEditorSelectedText()).toBe("");
  });

  it("notifies subscribers when editor selection changes", () => {
    const { result } = renderHook(() => useWorkspaceState(true));
    const callback = vi.fn();

    act(() => {
      result.current.subscribeToEditorSelectionChange(callback);
    });

    act(() => {
      result.current.handleEditorSelectionChange("hello world");
    });

    expect(callback).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleEditorSelectionChange("updated");
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("unsubscribing stops further notifications", () => {
    const { result } = renderHook(() => useWorkspaceState(true));
    const callback = vi.fn();
    let unsubscribe: () => void;

    act(() => {
      unsubscribe = result.current.subscribeToEditorSelectionChange(callback);
    });

    act(() => {
      unsubscribe();
    });

    act(() => {
      result.current.handleEditorSelectionChange("text after unsubscribe");
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("supports multiple subscribers and notifies all of them", () => {
    const { result } = renderHook(() => useWorkspaceState(true));
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    act(() => {
      result.current.subscribeToEditorSelectionChange(cb1);
      result.current.subscribeToEditorSelectionChange(cb2);
    });

    act(() => {
      result.current.handleEditorSelectionChange("multi");
    });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
