/**
 * buildInlineDecorations のユニットテスト。
 * Markdown インライン構文（太字・斜体・コード）に対して
 * 正しいデコレーションが生成されることを検証する。
 * DOM を必要としない fakeView シムを使用する。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { buildInlineDecorations } from "../inlineStyles";

/** DOM なしで動作する最小限の EditorView シム */
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

// ---------------------------------------------------------------
// Helpers to introspect decorations
// ---------------------------------------------------------------
function getMarkDecs(
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
      d.value.eq(Decoration.replace({})) ||
      // DecorationSet replace has no .spec.class
      (!(d.value.spec as { class?: string }).class &&
        (d.value.spec as { widget?: unknown }).widget === undefined)
  );
}

// ---------------------------------------------------------------
// StrongEmphasis  (**world**)
// ---------------------------------------------------------------
describe("buildInlineDecorations — StrongEmphasis", () => {
  const doc = "hello **world** end";
  //           0123456789...
  // **world** spans [6, 15]

  it("emits a cm-md-strong mark decoration covering the full node", () => {
    const state = makeState(doc);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs, "cm-md-strong");
    expect(marks.length).toBeGreaterThanOrEqual(1);
    // At least one mark must span [6, 15]
    expect(marks.some((d) => d.from === 6 && d.to === 15)).toBe(true);
  });

  it("emits replace decorations for both ** markers when cursor is outside", () => {
    const state = makeState(doc, 0); // cursor at 0, outside **world**
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    // Opening ** at [6,8], closing ** at [13,15]
    expect(replaces.some((d) => d.from === 6 && d.to === 8)).toBe(true);
    expect(replaces.some((d) => d.from === 13 && d.to === 15)).toBe(true);
  });

  it("does NOT emit replace decorations when cursor is inside **world**", () => {
    // cursor inside "world" e.g. at position 10
    const state = makeState(doc, 10);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    expect(replaces.some((d) => d.from === 6 && d.to === 8)).toBe(false);
    expect(replaces.some((d) => d.from === 13 && d.to === 15)).toBe(false);
  });
});

// ---------------------------------------------------------------
// Emphasis  (*italic*)
// ---------------------------------------------------------------
describe("buildInlineDecorations — Emphasis", () => {
  const doc = "hello *italic* end";
  //           01234567...
  // *italic* spans [6, 14]

  it("emits a cm-md-em mark decoration covering the full node", () => {
    const state = makeState(doc);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs, "cm-md-em");
    expect(marks.length).toBeGreaterThanOrEqual(1);
    expect(marks.some((d) => d.from === 6 && d.to === 14)).toBe(true);
  });

  it("emits replace decorations for both * markers when cursor is outside", () => {
    const state = makeState(doc, 0);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    // Opening * at [6,7], closing * at [13,14]
    expect(replaces.some((d) => d.from === 6 && d.to === 7)).toBe(true);
    expect(replaces.some((d) => d.from === 13 && d.to === 14)).toBe(true);
  });

  it("does NOT emit replace decorations when cursor is inside *italic*", () => {
    const state = makeState(doc, 9);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    expect(replaces.some((d) => d.from === 6 && d.to === 7)).toBe(false);
    expect(replaces.some((d) => d.from === 13 && d.to === 14)).toBe(false);
  });
});

// ---------------------------------------------------------------
// InlineCode  (`code`)
// ---------------------------------------------------------------
describe("buildInlineDecorations — InlineCode", () => {
  const doc = "hello `code` end";
  //           0123456789...
  // `code` spans [6, 12]: backtick at 6, "code" at [7,11], backtick at 11

  it("emits a cm-md-code mark decoration covering code content only (no backticks)", () => {
    // Mark is narrowed to content [7, 11] to avoid nextLayer overlap with the
    // replace decorations at [6,7] and [11,12] (same `from` would push mark to nextLayer)
    const state = makeState(doc);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs, "cm-md-code");
    expect(marks.length).toBeGreaterThanOrEqual(1);
    // Mark covers only the code content "code" at [7, 11], not the full node [6, 12]
    expect(marks.some((d) => d.from === 7 && d.to === 11)).toBe(true);
  });

  it("emits replace decorations for both backticks when cursor is outside", () => {
    const state = makeState(doc, 0);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    // Opening ` at [6,7], closing ` at [11,12]
    expect(replaces.some((d) => d.from === 6 && d.to === 7)).toBe(true);
    expect(replaces.some((d) => d.from === 11 && d.to === 12)).toBe(true);
  });

  it("does NOT emit replace decorations when cursor is inside `code`", () => {
    const state = makeState(doc, 8);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const replaces = getReplaceDecs(decs);
    expect(replaces.some((d) => d.from === 6 && d.to === 7)).toBe(false);
    expect(replaces.some((d) => d.from === 11 && d.to === 12)).toBe(false);
  });

  it("still emits mark decoration when cursor is inside backtick code (markers visible)", () => {
    // When cursor is inside, backtick replaces are not added but mark still applies
    const state = makeState(doc, 8); // cursor inside "code"
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs, "cm-md-code");
    expect(marks.some((d) => d.from === 7 && d.to === 11)).toBe(true);
  });
});

// ---------------------------------------------------------------
// cm-md-marker — delimiter color when cursor is inside
// ---------------------------------------------------------------
describe("buildInlineDecorations — cm-md-marker on delimiters", () => {
  it("emits cm-md-marker on ** markers when cursor is inside StrongEmphasis", () => {
    const doc = "hello **world** end";
    const state = makeState(doc, 10); // cursor inside "world"
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const markers = getMarkDecs(decs, "cm-md-marker");
    expect(markers.some((d) => d.from === 6 && d.to === 8)).toBe(true);
    expect(markers.some((d) => d.from === 13 && d.to === 15)).toBe(true);
  });

  it("emits cm-md-marker on * markers when cursor is inside Emphasis", () => {
    const doc = "hello *italic* end";
    const state = makeState(doc, 9); // cursor inside "italic"
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const markers = getMarkDecs(decs, "cm-md-marker");
    expect(markers.some((d) => d.from === 6 && d.to === 7)).toBe(true);
    expect(markers.some((d) => d.from === 13 && d.to === 14)).toBe(true);
  });

  it("emits cm-md-marker on backtick markers when cursor is inside InlineCode", () => {
    const doc = "hello `code` end";
    const state = makeState(doc, 8); // cursor inside "code"
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const markers = getMarkDecs(decs, "cm-md-marker");
    expect(markers.some((d) => d.from === 6 && d.to === 7)).toBe(true);
    expect(markers.some((d) => d.from === 11 && d.to === 12)).toBe(true);
  });

  it("does NOT emit cm-md-marker when cursor is outside the range", () => {
    const doc = "hello **world** end";
    const state = makeState(doc, 0); // cursor outside
    const decs = buildInlineDecorations(state, makeFakeView(state));
    const markers = getMarkDecs(decs, "cm-md-marker");
    expect(markers.length).toBe(0);
  });
});

// ---------------------------------------------------------------
// Multiple inline elements on the same line
// ---------------------------------------------------------------
describe("buildInlineDecorations — multiple elements", () => {
  it("handles bold and italic on the same line", () => {
    const doc = "**bold** and *italic*";
    const state = makeState(doc, 0);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    expect(getMarkDecs(decs, "cm-md-strong").length).toBeGreaterThanOrEqual(1);
    expect(getMarkDecs(decs, "cm-md-em").length).toBeGreaterThanOrEqual(1);
  });

  it("returns decorations sorted by from position", () => {
    const doc = "**bold** and *italic*";
    const state = makeState(doc, 0);
    const decs = buildInlineDecorations(state, makeFakeView(state));
    for (let i = 1; i < decs.length; i++) {
      expect(decs[i].from).toBeGreaterThanOrEqual(decs[i - 1].from);
    }
  });
});
