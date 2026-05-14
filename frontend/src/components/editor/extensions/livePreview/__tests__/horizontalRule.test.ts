/**
 * buildHorizontalRuleDecorations のユニットテスト。
 * Markdown 水平線（---）に対して
 * ラインデコレーション + テキスト非表示デコレーションが正しく生成されることを検証する。
 * block: true ウィジェット廃止後の実装（line decoration + CSS ::after）に対応。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { buildHorizontalRuleDecorations } from "../horizontalRule";

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

function getLineDecs(decs: Range<Decoration>[]): Range<Decoration>[] {
  return decs.filter(
    (d) => (d.value.spec as { class?: string }).class !== undefined
  );
}

function getReplaceDecs(decs: Range<Decoration>[]): Range<Decoration>[] {
  return decs.filter((d) => {
    const spec = d.value.spec as { class?: string; widget?: unknown };
    return spec.class === undefined && spec.widget === undefined;
  });
}

// ---------------------------------------------------------------
// HorizontalRule
// ---------------------------------------------------------------
describe("buildHorizontalRuleDecorations", () => {
  // "above\n\n---\n\nbelow"
  //  01234 5 6789 10 11-15
  // line 1: "above" from=0  to=5
  // line 2: ""      from=6  to=6
  // line 3: "---"   from=7  to=10  (HorizontalRule node [7,10])
  // line 4: ""      from=11 to=11
  // line 5: "below" from=12 to=16
  const doc = "above\n\n---\n\nbelow";

  it("emits a line decoration for --- when cursor is NOT on the HR line", () => {
    const state = makeState(doc, 0); // cursor in "above"
    const decs = buildHorizontalRuleDecorations(state, makeFakeView(state));
    const lineDecs = getLineDecs(decs);
    expect(lineDecs.length).toBe(1);
    expect(lineDecs[0].from).toBe(7); // line.from of the "---" line
    expect((lineDecs[0].value.spec as { class: string }).class).toBe("cm-md-hr-line");
  });

  it("emits a replace decoration hiding --- text when cursor is NOT on the HR line", () => {
    const state = makeState(doc, 0); // cursor in "above"
    const decs = buildHorizontalRuleDecorations(state, makeFakeView(state));
    const replaceDecs = getReplaceDecs(decs);
    expect(replaceDecs.length).toBe(1);
    // Covers the "---" HorizontalRule node [7, 10]
    expect(replaceDecs[0].from).toBe(7);
    expect(replaceDecs[0].to).toBe(10);
  });

  it("emits exactly two decorations (line + replace) when cursor is NOT on HR", () => {
    const state = makeState(doc, 0);
    const decs = buildHorizontalRuleDecorations(state, makeFakeView(state));
    expect(decs.length).toBe(2);
  });

  it("does NOT emit any decorations when cursor IS on the --- line", () => {
    // "---" starts at position 7
    const state = makeState(doc, 8); // cursor on "---" line
    const decs = buildHorizontalRuleDecorations(state, makeFakeView(state));
    expect(decs.length).toBe(0);
  });

  it("emits no decorations when doc has no horizontal rule", () => {
    const state = makeState("just some text", 0);
    const decs = buildHorizontalRuleDecorations(state, makeFakeView(state));
    expect(decs.length).toBe(0);
  });
});
