/**
 * buildCodeBlockDecorations のユニットテスト。
 * Markdown フェンスコードブロック（``` ... ```）に対して
 * 正しいラインデコレーションとフェンス行隠蔽が生成されることを検証する。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { buildCodeBlockDecorations } from "../codeBlocks";

function makeFakeView(state: EditorState): EditorView {
  return {
    visibleRanges: [{ from: 0, to: state.doc.length }],
    state,
    composing: false,
  } as unknown as EditorView;
}

function makeState(doc: string, cursorPos = 0): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorPos),
    extensions: [markdown()],
  });
  ensureSyntaxTree(state, state.doc.length, 100);
  return state;
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
  return decs.filter((d) => {
    const spec = d.value.spec as { class?: string; widget?: unknown };
    return spec.class === undefined && spec.widget === undefined;
  });
}

// ---------------------------------------------------------------
// FencedCode
// ---------------------------------------------------------------
describe("buildCodeBlockDecorations — FencedCode", () => {
  // "```\ncode here\n```"
  // line 1: "```"      from=0  to=3
  // line 2: "code here" from=4 to=13
  // line 3: "```"      from=14 to=17
  const doc = "```\ncode here\n```";

  it("emits cm-md-fenced line decoration on all lines inside the fenced code block", () => {
    const state = makeState(doc, 0);
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const lineDecs = getLineDecs(decs, "cm-md-fenced");
    // Should have decorations on at least the opening fence, code, and closing fence lines
    expect(lineDecs.length).toBeGreaterThanOrEqual(3);
    // Opening fence line (from=0)
    expect(lineDecs.some((d) => d.from === 0)).toBe(true);
    // Code line (from=4)
    expect(lineDecs.some((d) => d.from === 4)).toBe(true);
    // Closing fence line (from=14)
    expect(lineDecs.some((d) => d.from === 14)).toBe(true);
  });

  it("emits no decorations for plain text", () => {
    const state = makeState("just some plain text", 0);
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    expect(decs.length).toBe(0);
  });

  it("handles fenced code with language specifier", () => {
    // "```ts\nconst x = 1;\n```"
    const doc2 = "```ts\nconst x = 1;\n```";
    const state = makeState(doc2, 0);
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const lineDecs = getLineDecs(decs, "cm-md-fenced");
    expect(lineDecs.length).toBeGreaterThanOrEqual(3);
    expect(lineDecs.some((d) => d.from === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------
// Fence-line hiding (カーソル離脱時の ``` 行隠蔽)
//
// "above\n```js\nconst x = 1;\n```"
//  0    5 6   11 12          24 25  28
// line 1: "above"        from=0  to=5
// line 2: "```js"        from=6  to=11  (opening fence)
// line 3: "const x = 1;" from=12 to=24  (content)
// line 4: "```"           from=25 to=28  (closing fence, to=28=doc.length)
// ---------------------------------------------------------------
describe("buildCodeBlockDecorations — fence-line hiding", () => {
  const doc = "above\n```js\nconst x = 1;\n```";
  const openFenceFrom = 6;
  const openFenceTo = 11;
  const closeFenceFrom = 25;
  const closeFenceTo = 28;

  it("hides opening fence line when cursor is outside the block", () => {
    const state = makeState(doc, 0); // cursor in "above"
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const replaceDecs = getReplaceDecs(decs);
    expect(replaceDecs.some((d) => d.from === openFenceFrom && d.to === openFenceTo)).toBe(true);
  });

  it("hides closing fence line when cursor is outside the block", () => {
    const state = makeState(doc, 0); // cursor in "above"
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const replaceDecs = getReplaceDecs(decs);
    expect(replaceDecs.some((d) => d.from === closeFenceFrom && d.to === closeFenceTo)).toBe(true);
  });

  it("emits exactly 2 replace decorations when cursor is outside", () => {
    const state = makeState(doc, 0);
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    expect(getReplaceDecs(decs).length).toBe(2);
  });

  it("does NOT hide opening fence when cursor is on that line", () => {
    const state = makeState(doc, 8); // cursor on "```js" line
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const replaceDecs = getReplaceDecs(decs);
    expect(replaceDecs.some((d) => d.from === openFenceFrom)).toBe(false);
  });

  it("emits cm-md-marker on opening fence line when cursor is on that line", () => {
    const state = makeState(doc, 8); // cursor on "```js" line
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const markers = getLineDecs(decs, "cm-md-marker");
    expect(markers.some((d) => d.from === openFenceFrom && d.to === openFenceTo)).toBe(true);
  });

  it("does NOT hide closing fence when cursor is on that line", () => {
    const state = makeState(doc, closeFenceFrom); // cursor on closing "```" line
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const replaceDecs = getReplaceDecs(decs);
    expect(replaceDecs.some((d) => d.from === closeFenceFrom)).toBe(false);
  });

  it("emits cm-md-marker on closing fence line when cursor is on that line", () => {
    const state = makeState(doc, closeFenceFrom); // cursor on closing "```" line
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const markers = getLineDecs(decs, "cm-md-marker");
    expect(markers.some((d) => d.from === closeFenceFrom && d.to === closeFenceTo)).toBe(true);
  });

  it("still emits cm-md-fenced line decorations for all lines even when cursor is inside", () => {
    const state = makeState(doc, 15); // cursor in content line
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const lineDecs = getLineDecs(decs, "cm-md-fenced");
    expect(lineDecs.length).toBe(3);
  });

  it("hides opening fence line with language specifier", () => {
    const state = makeState(doc, 0);
    const decs = buildCodeBlockDecorations(state, makeFakeView(state));
    const replaceDecs = getReplaceDecs(decs);
    // "```js" should be hidden (language specifier doesn't affect hiding)
    expect(replaceDecs.some((d) => d.from === openFenceFrom)).toBe(true);
  });
});
