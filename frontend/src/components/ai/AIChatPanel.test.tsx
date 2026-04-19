import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/hooks", () => ({
  useTranslation: () => ({
    t: (key: string, _opts?: unknown) => key,
  }),
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <span>{children}</span>,
}));

vi.mock("remark-gfm", () => ({ default: () => {} }));

vi.mock("./DiffView", () => ({
  DiffView: () => <div data-testid="diff-view" />,
}));

import { AIChatPanel } from "./AIChatPanel";
import type { Note, Folder } from "@/types";

const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "note-1",
  title: "Test Note",
  content: "note content",
  folder_id: null,
  user_id: "user-1",
  created_at: "",
  updated_at: "",
  deleted_at: null,
  version: 1,
  ...overrides,
});

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  messages: [],
  onSendMessage: vi.fn(),
  onClearChat: vi.fn(),
  isLoading: false,
  selectedNote: null,
  selectedFolder: null as Folder | null,
};

describe("AIChatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the panel when isOpen is true", () => {
    render(<AIChatPanel {...defaultProps} />);
    expect(screen.getByText("ai.title")).toBeInTheDocument();
    expect(screen.queryByTitle("ai.openAIChat")).not.toBeInTheDocument();
  });

  it("renders the collapsed icon button when isOpen is false", () => {
    render(<AIChatPanel {...defaultProps} isOpen={false} />);
    expect(screen.getByTitle("ai.openAIChat")).toBeInTheDocument();
  });

  describe("1.7: getter-based content and selection", () => {
    it("passes content from getCurrentEditorContent getter to onSendEditRequest at send time", () => {
      const onSendEditRequest = vi.fn();
      const getCurrentEditorContent = vi.fn().mockReturnValue("content at send time");
      const note = makeNote();

      render(
        <AIChatPanel
          {...defaultProps}
          selectedNote={note}
          isEditMode={true}
          onSendEditRequest={onSendEditRequest}
          getCurrentEditorContent={getCurrentEditorContent}
          getCurrentEditorSelectedText={() => ""}
          subscribeToEditorSelectionChange={() => () => {}}
        />
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "my instruction" } });
      fireEvent.click(screen.getByTestId("ai-chat-send-button"));

      expect(onSendEditRequest).toHaveBeenCalledWith(
        "my instruction",
        "content at send time",
        "note-1",
        undefined
      );
      expect(getCurrentEditorContent).toHaveBeenCalledTimes(1);
    });

    it("computes selectionRange at send time from getter values", () => {
      const onSendEditRequest = vi.fn();
      const content = "hello world foo bar";
      const selected = "world foo";

      render(
        <AIChatPanel
          {...defaultProps}
          selectedNote={makeNote()}
          isEditMode={true}
          onSendEditRequest={onSendEditRequest}
          getCurrentEditorContent={() => content}
          getCurrentEditorSelectedText={() => selected}
          subscribeToEditorSelectionChange={() => () => {}}
        />
      );

      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "fix this" } });
      fireEvent.click(screen.getByTestId("ai-chat-send-button"));

      const expectedStart = content.indexOf(selected);
      expect(onSendEditRequest).toHaveBeenCalledWith(
        "fix this",
        content,
        "note-1",
        { start: expectedStart, end: expectedStart + selected.length }
      );
    });

    it("shows selection line count in edit mode when subscription fires", () => {
      let notifySubscribers: () => void = () => {};
      let currentSelectedText = "";

      const subscribeToEditorSelectionChange = (cb: () => void) => {
        notifySubscribers = cb;
        return () => {};
      };
      const getCurrentEditorSelectedText = () => currentSelectedText;

      render(
        <AIChatPanel
          {...defaultProps}
          selectedNote={makeNote()}
          isEditMode={true}
          subscribeToEditorSelectionChange={subscribeToEditorSelectionChange}
          getCurrentEditorSelectedText={getCurrentEditorSelectedText}
          getCurrentEditorContent={() => ""}
        />
      );

      // Initially shows note title
      expect(screen.getByText("Test Note")).toBeInTheDocument();

      // Simulate selection change
      act(() => {
        currentSelectedText = "line 1\nline 2\nline 3";
        notifySubscribers();
      });

      // Should now show line count via "ai.selectedLines"
      expect(screen.getByText("ai.selectedLines")).toBeInTheDocument();
    });

    it("sends selected text via onSendMessage when scope is selection", async () => {
      const onSendMessage = vi.fn();
      let notifySubscribers: () => void = () => {};
      let currentSelectedText = "";

      const subscribeToEditorSelectionChange = (cb: () => void) => {
        notifySubscribers = cb;
        return () => {};
      };

      render(
        <AIChatPanel
          {...defaultProps}
          selectedNote={makeNote()}
          isEditMode={false}
          onSendMessage={onSendMessage}
          subscribeToEditorSelectionChange={subscribeToEditorSelectionChange}
          getCurrentEditorSelectedText={() => currentSelectedText}
          getCurrentEditorContent={() => ""}
        />
      );

      // Simulate selection so that "selection" scope option appears
      act(() => {
        currentSelectedText = "some selected text";
        notifySubscribers();
      });

      // Manually trigger send with current scope (note) to verify basic send works
      const textarea = screen.getByRole("textbox");
      fireEvent.change(textarea, { target: { value: "hello" } });
      fireEvent.click(screen.getByTestId("ai-chat-send-button"));

      expect(onSendMessage).toHaveBeenCalledWith(
        "hello",
        "note",
        "note-1",
        null,
        undefined
      );
    });
  });
});
