/**
 * buildHeadingDecorations のユニットテスト。
 * ATX 見出し（#〜##）および Setext 見出しに対して
 * 正しいデコレーションが生成されることを検証する。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { buildHeadingDecorations } from "../headings";

function makeFakeView(state: EditorState): EditorView {
  return {
    visibleRanges: [{ from: 0, to: state.doc.length }],
    state,
    composing: false,
  } as unknown as EditorView;
}

function makeState(doc: string, cursorPos = 0): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorPos),
    extensions: [markdown()],
  });
}

function getLineDecs(
  decs: Range<Decoration>[],
  className: string
): Range<Decoration>[] {
  return decs.filter(
    (d) => (d.value.spec as { class?: string }).class === className
  );
}

function getReplaceDecs(decs: Range<Decoration>[]): Range<Decoration>[] {
  return decs.filter(
    (d) =>
      !(d.value.spec as { class?: string }).class &&
      (d.value.spec as { widget?: unknown }).widget === undefined
  );
}

// ---------------------------------------------------------------
// ATX H1 (# Hello)
// ---------------------------------------------------------------
describe("buildHeadingDecorations — ATXHeading1", () => {
  const doc = "# Hello\n\nSome text";
  // "# Hello" is line 1: from=0, to=7
  // cursor at position 15 (in "Some text") means NOT on heading line

  it("emits cm-md-h1 line decoration on the heading line", () => {
    const state = makeState(doc, 15); // cursor far from heading
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    const lineDecs = getLineDecs(decs, "cm-md-h1");
    expect(lineDecs.length).toBeGreaterThanOrEqual(1);
    // Line decoration from position must be the start of line 1 (pos 0)
    expect(lineDecs.some((d) => d.from === 0)).toBe(true);
  });

  it("emits HeaderMark replace decoration when cursor is NOT on heading line", () => {
    const state = makeState(doc, 15); // cursor in "Some text"
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    // "#" HeaderMark is at [0, 1] (space is NOT part of HeaderMark)
    expect(replaces.some((d) => d.from === 0 && d.to === 1)).toBe(true);
  });

  it("does NOT emit HeaderMark replace decoration when cursor IS on heading line", () => {
    const state = makeState(doc, 4); // cursor inside "Hello" on heading line
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    // Should NOT have a replace at [0, 1] (the "#" HeaderMark)
    expect(replaces.some((d) => d.from === 0 && d.to === 1)).toBe(false);
  });
});

// ---------------------------------------------------------------
// ATX H2 (## Second)
// ---------------------------------------------------------------
describe("buildHeadingDecorations — ATXHeading2", () => {
  const doc = "## Second";
  // "## Second" is line 1: from=0

  it("emits cm-md-h2 line decoration on the heading line", () => {
    const state = makeState(doc, 0);
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    const lineDecs = getLineDecs(decs, "cm-md-h2");
    expect(lineDecs.length).toBeGreaterThanOrEqual(1);
    expect(lineDecs.some((d) => d.from === 0)).toBe(true);
  });

  it("emits HeaderMark replace when cursor elsewhere (cursor at end, header at start)", () => {
    // Place cursor far enough that isCursorOnLine returns false.
    // "## Second" is a single-line doc, so cursor is always on the same line.
    // Use a two-line doc to test properly.
    const doc2 = "## Second\n\nother line";
    const state = makeState(doc2, 15); // cursor in "other line"
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    // "##" HeaderMark is at [0, 2] (space is NOT part of HeaderMark)
    expect(replaces.some((d) => d.from === 0 && d.to === 2)).toBe(true);
  });
});

// ---------------------------------------------------------------
// Multiple heading levels
// ---------------------------------------------------------------
describe("buildHeadingDecorations — heading levels", () => {
  it("emits cm-md-h3 for ### heading", () => {
    const doc = "### Title\n\ntext";
    const state = makeState(doc, 12);
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    expect(getLineDecs(decs, "cm-md-h3").some((d) => d.from === 0)).toBe(true);
  });

  it("emits cm-md-h4 for #### heading", () => {
    const doc = "#### Title\n\ntext";
    const state = makeState(doc, 13);
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    expect(getLineDecs(decs, "cm-md-h4").some((d) => d.from === 0)).toBe(true);
  });

  it("emits cm-md-h5 for ##### heading", () => {
    const doc = "##### Title\n\ntext";
    const state = makeState(doc, 14);
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    expect(getLineDecs(decs, "cm-md-h5").some((d) => d.from === 0)).toBe(true);
  });

  it("emits cm-md-h6 for ###### heading", () => {
    const doc = "###### Title\n\ntext";
    const state = makeState(doc, 15);
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    expect(getLineDecs(decs, "cm-md-h6").some((d) => d.from === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------
// Setext headings
// ---------------------------------------------------------------
describe("buildHeadingDecorations — Setext headings", () => {
  it("emits cm-md-h1 on text line and cm-md-h1-underline on === line", () => {
    const doc = "Hello\n===\n\ntext";
    const state = makeState(doc, 12); // cursor in "text"
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    const h1Lines = getLineDecs(decs, "cm-md-h1");
    const underlines = getLineDecs(decs, "cm-md-h1-underline");
    expect(h1Lines.some((d) => d.from === 0)).toBe(true);
    expect(underlines.some((d) => d.from === 6)).toBe(true); // "===" starts at pos 6
  });

  it("emits cm-md-h2 on text line and cm-md-h2-underline on --- line", () => {
    const doc = "Hello\n---\n\ntext";
    const state = makeState(doc, 12); // cursor in "text"
    const decs = buildHeadingDecorations(state, makeFakeView(state));
    const h2Lines = getLineDecs(decs, "cm-md-h2");
    const underlines = getLineDecs(decs, "cm-md-h2-underline");
    expect(h2Lines.some((d) => d.from === 0)).toBe(true);
    expect(underlines.some((d) => d.from === 6)).toBe(true);
  });
});
