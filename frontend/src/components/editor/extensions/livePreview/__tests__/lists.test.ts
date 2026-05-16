/**
 * buildListDecorations のユニットテスト。
 * BulletList / OrderedList の ListMark ウィジェット置換とマーカー色付与を検証する。
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
    const state = makeState(doc, 5);
    const decs = buildListDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    expect(widgets.some((d) => d.from === 0 && d.to === 1)).toBe(false);
    expect(widgets.some((d) => d.from === 11 && d.to === 12)).toBe(true);
  });

  it("emits cm-md-marker on ListMark when cursor is on the same line", () => {
    const state = makeState(doc, 5); // cursor inside "item one"
    const decs = buildListDecorations(state, makeFakeView(state));
    const markers = getMarkDecs(decs, "cm-md-marker");
    expect(markers.some((d) => d.from === 0 && d.to === 1)).toBe(true);
  });
});

// ---------------------------------------------------------------
// OrderedList
// ---------------------------------------------------------------
describe("buildListDecorations — OrderedList", () => {
  const doc = "1. first\n2. second\n\nsome text";
  // line 1: "1. first"   from=0   to=8   ListMark at [0, 2]
  // line 2: "2. second"  from=9  to=18  ListMark at [9, 11]
  // line 4: "some text"  from=20 to=29

  it("emits widget replace on both ListMarks when cursor is elsewhere", () => {
    const state = makeState(doc, 22); // cursor on "some text"
    const decs = buildListDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    expect(widgets.some((d) => d.from === 0 && d.to === 2)).toBe(true);
    expect(widgets.some((d) => d.from === 9 && d.to === 11)).toBe(true);
  });

  it("does NOT emit widget on line 1 mark when cursor is on line 1", () => {
    const state = makeState(doc, 4); // cursor inside "first"
    const decs = buildListDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    expect(widgets.some((d) => d.from === 0 && d.to === 2)).toBe(false);
    // line 2 still gets widget
    expect(widgets.some((d) => d.from === 9 && d.to === 11)).toBe(true);
  });

  it("emits cm-md-marker on line 1 ListMark when cursor is on line 1", () => {
    const state = makeState(doc, 4);
    const decs = buildListDecorations(state, makeFakeView(state));
    const markers = getMarkDecs(decs, "cm-md-marker");
    expect(markers.some((d) => d.from === 0 && d.to === 2)).toBe(true);
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
