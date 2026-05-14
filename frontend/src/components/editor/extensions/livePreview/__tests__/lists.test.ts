/**
 * buildListDecorations のユニットテスト。
 * BulletList の ListMark 置換と OrderedList の cm-md-ol-mark マーク付与を検証する。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { buildListDecorations } from "../lists";

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

/** widget を持つ replace デコレーションを取得する */
function getWidgetDecs(decs: Range<Decoration>[]): Range<Decoration>[] {
  return decs.filter(
    (d) =>
      (d.value.spec as { widget?: unknown }).widget !== undefined &&
      !(d.value.spec as { class?: string }).class
  );
}

/** 指定クラスの mark デコレーションを取得する */
function getMarkDecs(
  decs: Range<Decoration>[],
  className: string
): Range<Decoration>[] {
  return decs.filter(
    (d) => (d.value.spec as { class?: string }).class === className
  );
}

// ---------------------------------------------------------------
// BulletList
// ---------------------------------------------------------------
describe("buildListDecorations — BulletList", () => {
  // Three-line doc so cursor can sit on a third line away from both list items
  const doc = "- item one\n- item two\n\nsome text";
  // line 1: "- item one"  from=0  to=10  ListMark at [0, 1]
  // line 2: "- item two"  from=11 to=21  ListMark at [11, 12]
  // line 3: ""            from=22 to=22
  // line 4: "some text"   from=23 to=32

  it("emits BulletWidget replace on both ListMarks when cursor is elsewhere", () => {
    // cursor on "some text" line — away from both list items
    const state = makeState(doc, 25);
    const decs = buildListDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    // Both ListMark replacements should be present
    expect(widgets.some((d) => d.from === 0 && d.to === 1)).toBe(true);
    expect(widgets.some((d) => d.from === 11 && d.to === 12)).toBe(true);
  });

  it("does NOT emit replace on line 1 mark when cursor is on line 1, still emits on line 2", () => {
    // cursor on line 1 (pos 5 = inside "item one")
    // Note: this uses the same extended doc
    const state = makeState(doc, 5);
    const decs = buildListDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    // Line 1 mark should NOT be replaced
    expect(widgets.some((d) => d.from === 0 && d.to === 1)).toBe(false);
    // Line 2 mark should still be replaced
    expect(widgets.some((d) => d.from === 11 && d.to === 12)).toBe(true);
  });
});

// ---------------------------------------------------------------
// OrderedList
// ---------------------------------------------------------------
describe("buildListDecorations — OrderedList", () => {
  const doc = "1. first\n2. second";
  // line 1: "1. first"   from=0   to=8   ListMark at [0, 2]
  // line 2: "2. second"  from=9  to=18  ListMark at [9, 11]

  it("always emits cm-md-ol-mark on both ListMarks (cursor-independent)", () => {
    // cursor on line 1
    const stateOnLine1 = makeState(doc, 4);
    const decs1 = buildListDecorations(stateOnLine1, makeFakeView(stateOnLine1));
    const marks1 = getMarkDecs(decs1, "cm-md-ol-mark");
    expect(marks1.some((d) => d.from === 0 && d.to === 2)).toBe(true);
    expect(marks1.some((d) => d.from === 9 && d.to === 11)).toBe(true);
  });

  it("cursor on line 2 still emits ol-mark on both lines", () => {
    const state = makeState(doc, 12);
    const decs = buildListDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs, "cm-md-ol-mark");
    expect(marks.some((d) => d.from === 0 && d.to === 2)).toBe(true);
    expect(marks.some((d) => d.from === 9 && d.to === 11)).toBe(true);
  });

  it("emits no widget replace decorations for ordered lists", () => {
    const state = makeState(doc, doc.length);
    const decs = buildListDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    expect(widgets.length).toBe(0);
  });
});

// ---------------------------------------------------------------
// Mixed: no decorations for plain paragraphs
// ---------------------------------------------------------------
describe("buildListDecorations — plain text", () => {
  it("emits no decorations for plain text", () => {
    const state = makeState("just some text", 0);
    const decs = buildListDecorations(state, makeFakeView(state));
    expect(decs.length).toBe(0);
  });
});
