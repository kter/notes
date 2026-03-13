import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/workspace/useWorkspaceState", () => ({
  useWorkspaceState: () => ({
    isDataLoading: true,
  }),
}));

vi.mock("@/components/ai", () => ({
  AIChatPanel: () => <div data-testid="ai-chat-panel" />,
}));

vi.mock("@/components/layout", () => ({
  EditorPanel: () => <div data-testid="editor-panel" />,
  NoteList: () => <div data-testid="note-list" />,
  SettingsDialog: () => <div data-testid="settings-dialog" />,
  Sidebar: () => <div data-testid="sidebar" />,
  ThreeColumnLayout: () => <div data-testid="three-column-layout" />,
}));

vi.mock("@/components/ui/SyncStatusIndicator", () => ({
  SyncStatusIndicator: () => <div data-testid="sync-status-indicator" />,
}));

vi.mock("@/components/workspace/WorkspaceSidebarFooter", () => ({
  WorkspaceSidebarFooter: () => <div data-testid="workspace-sidebar-footer" />,
}));

import { AuthenticatedWorkspace } from "./AuthenticatedWorkspace";

describe("AuthenticatedWorkspace", () => {
  it("renders the translated loading state while home data is loading", () => {
    render(<AuthenticatedWorkspace onSignOut={vi.fn()} />);

    expect(screen.getByText("common.loading")).toBeInTheDocument();
  });
});
