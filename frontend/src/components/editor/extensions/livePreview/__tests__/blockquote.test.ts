/**
 * buildBlockquoteDecorations のユニットテスト。
 * Markdown ブロッククォートに対して
 * 正しいデコレーションが生成されることを検証する。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { buildBlockquoteDecorations } from "../blockquote";

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
// Basic blockquote
// ---------------------------------------------------------------
describe("buildBlockquoteDecorations — basic", () => {
  const doc = "> quoted text\n\nother";
  // "> quoted text" is line 1: from=0, to=13
  // ">" QuoteMark is at [0, 1] (or [0, 2] with trailing space)

  it("emits cm-md-blockquote line decoration on the blockquote line", () => {
    const state = makeState(doc, 16); // cursor in "other"
    const decs = buildBlockquoteDecorations(state, makeFakeView(state));
    const lineDecs = getLineDecs(decs, "cm-md-blockquote");
    expect(lineDecs.length).toBeGreaterThanOrEqual(1);
    expect(lineDecs.some((d) => d.from === 0)).toBe(true);
  });

  it("emits QuoteMark replace decoration when cursor is NOT on blockquote line", () => {
    const state = makeState(doc, 16); // cursor in "other"
    const decs = buildBlockquoteDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    // QuoteMark (">") should be replaced — starts at 0
    expect(replaces.some((d) => d.from === 0)).toBe(true);
  });

  it("does NOT emit QuoteMark replace decoration when cursor IS on blockquote line", () => {
    const state = makeState(doc, 5); // cursor inside "quoted text" on blockquote line
    const decs = buildBlockquoteDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    // No replace decoration should start at position 0
    expect(replaces.some((d) => d.from === 0)).toBe(false);
  });
});

// ---------------------------------------------------------------
// Multi-line blockquote
// ---------------------------------------------------------------
describe("buildBlockquoteDecorations — multi-line", () => {
  it("emits line decorations for all lines in a multi-line blockquote", () => {
    const doc = "> line one\n> line two\n\nother";
    // line 1: "> line one" from=0
    // line 2: "> line two" from=11
    const state = makeState(doc, 24); // cursor in "other"
    const decs = buildBlockquoteDecorations(state, makeFakeView(state));
    const lineDecs = getLineDecs(decs, "cm-md-blockquote");
    expect(lineDecs.some((d) => d.from === 0)).toBe(true);
    expect(lineDecs.some((d) => d.from === 11)).toBe(true);
  });
});
