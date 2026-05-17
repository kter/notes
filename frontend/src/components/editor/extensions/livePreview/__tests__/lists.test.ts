/**
 * buildListDecorations のユニットテスト。
 *
 * 修正方針（Issue #89）:
 * - カーソル行の ListMark には装飾なし（Raw Edit と同様にして IME 干渉を防ぐ）
 * - 非カーソル行の ListMark には Decoration.mark を付与（cm-md-bullet / cm-md-ol-mark）
 * - Decoration.replace（widget 置換）は廃止済み
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { buildListDecorations } from "../lists";

function makeFakeView(state: EditorState, composing = false): EditorView {
  return {
    visibleRanges: [{ from: 0, to: state.doc.length }],
    state,
    composing,
  } as unknown as EditorView;
}

function makeState(doc: string, cursorPos = 0): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorPos),
    extensions: [markdown()],
  });
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

/** widget を持つ replace デコレーションを取得する（廃止後は 0 件であること確認用）*/
function getWidgetDecs(decs: Range<Decoration>[]): Range<Decoration>[] {
  return decs.filter(
    (d) =>
      (d.value.spec as { widget?: unknown }).widget !== undefined &&
      !(d.value.spec as { class?: string }).class
  );
}

// ---------------------------------------------------------------
// BulletList
// ---------------------------------------------------------------
describe("buildListDecorations — BulletList", () => {
  const doc = "- item one\n- item two\n\nsome text";
  // line 1: "- item one"  from=0  to=10  ListMark at [0, 1]
  // line 2: "- item two"  from=11 to=21  ListMark at [11, 12]
  // line 3: ""            from=22 to=22
  // line 4: "some text"   from=23 to=32

  it("emits cm-md-bullet mark on both ListMarks when cursor is not on either list line", () => {
    // cursor on "some text" line — away from both list items
    const state = makeState(doc, 25);
    const decs = buildListDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs, "cm-md-bullet");
    expect(marks.some((d) => d.from === 0 && d.to === 1)).toBe(true);
    expect(marks.some((d) => d.from === 11 && d.to === 12)).toBe(true);
  });

  it("does NOT emit any mark on line 1 ListMark when cursor is on line 1 (Issue #89 fix)", () => {
    // カーソルが line 1 にいる場合、line 1 の `-` は装飾しない
    const state = makeState(doc, 5);
    const decs = buildListDecorations(state, makeFakeView(state));
    const bulletMarks = getMarkDecs(decs, "cm-md-bullet");
    // line 1 の mark はない
    expect(bulletMarks.some((d) => d.from === 0 && d.to === 1)).toBe(false);
    // line 2 の mark はある
    expect(bulletMarks.some((d) => d.from === 11 && d.to === 12)).toBe(true);
  });

  it("never emits widget replace decorations (Issue #89 regression guard)", () => {
    const state = makeState(doc, 5);
    const decs = buildListDecorations(state, makeFakeView(state));
    expect(getWidgetDecs(decs).length).toBe(0);
  });

  it("never emits widget replace decorations during IME composition (composing=true)", () => {
    // IME 変換中（composing=true）でも widget が出ないことを確認
    const state = makeState(doc, 5);
    const decs = buildListDecorations(state, makeFakeView(state, true));
    expect(getWidgetDecs(decs).length).toBe(0);
    // カーソル行（line 1）の mark はなく、line 2 の mark はある
    const marks = getMarkDecs(decs, "cm-md-bullet");
    expect(marks.some((d) => d.from === 0 && d.to === 1)).toBe(false);
    expect(marks.some((d) => d.from === 11 && d.to === 12)).toBe(true);
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

  it("emits cm-md-ol-mark on both ListMarks when cursor is not on either list line", () => {
    const state = makeState(doc, 22); // cursor on "some text"
    const decs = buildListDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs, "cm-md-ol-mark");
    expect(marks.some((d) => d.from === 0 && d.to === 2)).toBe(true);
    expect(marks.some((d) => d.from === 9 && d.to === 11)).toBe(true);
  });

  it("does NOT emit mark on line 1 ListMark when cursor is on line 1 (Issue #89 fix)", () => {
    const state = makeState(doc, 4); // cursor inside "first"
    const decs = buildListDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs, "cm-md-ol-mark");
    // line 1 の mark はない
    expect(marks.some((d) => d.from === 0 && d.to === 2)).toBe(false);
    // line 2 の mark はある
    expect(marks.some((d) => d.from === 9 && d.to === 11)).toBe(true);
  });

  it("never emits widget replace decorations (Issue #89 regression guard)", () => {
    const state = makeState(doc, 4);
    const decs = buildListDecorations(state, makeFakeView(state));
    expect(getWidgetDecs(decs).length).toBe(0);
  });

  it("never emits widget replace decorations during IME composition (composing=true)", () => {
    const state = makeState(doc, 4);
    const decs = buildListDecorations(state, makeFakeView(state, true));
    expect(getWidgetDecs(decs).length).toBe(0);
    const marks = getMarkDecs(decs, "cm-md-ol-mark");
    expect(marks.some((d) => d.from === 0 && d.to === 2)).toBe(false);
    expect(marks.some((d) => d.from === 9 && d.to === 11)).toBe(true);
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
