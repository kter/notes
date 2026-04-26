import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { indentGuide } from "../indentGuide";

function makeView(doc: string, cursorPos: number): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorPos),
    extensions: [indentGuide],
  });
  return new EditorView({ state, parent: document.body });
}

function getOverlay(view: EditorView): HTMLElement | null {
  return view.dom.querySelector('[data-testid="indent-guide-overlay"]');
}

function isVisible(view: EditorView): boolean {
  return getOverlay(view)?.style.display !== "none";
}

function guideLineCount(view: EditorView): number {
  return view.dom.querySelectorAll('[data-testid^="indent-guide-line-"]').length;
}

describe("indentGuide ViewPlugin", () => {
  let view: EditorView;

  afterEach(() => { view.destroy(); });

  it("shows overlay when cursor is at the list-marker prefix of an indented line", () => {
    view = makeView("  - item", 3); // cursor inside "  - " prefix
    expect(isVisible(view)).toBe(true);
  });

  it("does not show overlay for a non-indented line", () => {
    view = makeView("- item", 0);
    expect(isVisible(view)).toBe(false);
  });

  it("shows correct number of guide lines for a 2-level indented line", () => {
    view = makeView("    - nested", 3); // 4 spaces = level 2
    expect(isVisible(view)).toBe(true);
    expect(guideLineCount(view)).toBe(2);
  });

  it("shows overlay when cursor moves into prefix region (selectionSet)", () => {
    view = makeView("  - item", 7); // cursor past prefix initially
    expect(isVisible(view)).toBe(false);

    // Move cursor to position 2 (inside prefix)
    view.dispatch({
      selection: EditorSelection.cursor(2),
    });
    expect(isVisible(view)).toBe(true);
  });

  it("hides overlay when cursor moves past the list-marker prefix region", () => {
    view = makeView("  - item", 2); // inside prefix
    expect(isVisible(view)).toBe(true);

    // Move cursor to position 6 (past "  - i")
    view.dispatch({
      selection: EditorSelection.cursor(6),
    });
    expect(isVisible(view)).toBe(false);
  });

  it("overlay has no auto-hide (stays visible over time)", () => {
    vi.useFakeTimers();
    try {
      view = makeView("  - item", 2);
      expect(isVisible(view)).toBe(true);
      vi.advanceTimersByTime(5000);
      expect(isVisible(view)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stays visible after doc changes when cursor is still in prefix", () => {
    view = makeView("  - item", 3);
    expect(isVisible(view)).toBe(true);

    // Insert a character elsewhere (doc changes)
    view.dispatch({
      changes: { from: 7, insert: "!" },
      // keep cursor at same relative position
      selection: EditorSelection.cursor(3),
    });
    expect(isVisible(view)).toBe(true);
  });

  it("overlay element has the correct testid", () => {
    view = makeView("  - item", 3);
    expect(getOverlay(view)).not.toBeNull();
    expect(getOverlay(view)!.getAttribute("data-testid")).toBe("indent-guide-overlay");
  });

  it("guide lines have sequential testids", () => {
    view = makeView("    - nested", 3); // level 2
    const line0 = view.dom.querySelector('[data-testid="indent-guide-line-0"]');
    const line1 = view.dom.querySelector('[data-testid="indent-guide-line-1"]');
    expect(line0).not.toBeNull();
    expect(line1).not.toBeNull();
  });
});
