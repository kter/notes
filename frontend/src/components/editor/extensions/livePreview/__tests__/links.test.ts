/**
 * buildLinkDecorations のユニットテスト。
 * Link ノードに対して cm-md-link マーク・LinkMark/URL の replace デコレーションが
 * 正しく生成されることを検証する。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { buildLinkDecorations } from "../links";

function makeFakeView(state: EditorState): EditorView {
  return {
    visibleRanges: [{ from: 0, to: state.doc.length }],
    state,
    composing: false,
  } as unknown as EditorView;
}

function makeState(doc: string, cursorPos: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorPos),
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  });
}

/** cm-md-link マークデコレーションを抽出する */
function getMarkDecs(decs: Range<Decoration>[]): Range<Decoration>[] {
  return decs.filter(
    (d) => (d.value.spec as { class?: string }).class === "cm-md-link"
  );
}

/** widget を持たない replace デコレーションを抽出する */
function getReplaceDecs(decs: Range<Decoration>[]): Range<Decoration>[] {
  return decs.filter((d) => {
    const spec = d.value.spec as { widget?: unknown; class?: unknown };
    return spec.widget === undefined && spec.class === undefined;
  });
}

// ---------------------------------------------------------------
// カーソルがリンク外にある場合
// ---------------------------------------------------------------
describe("buildLinkDecorations — cursor outside link", () => {
  // "see [example](https://example.com) here\nsecond"
  // cursor at end of second line
  const doc = "see [example](https://example.com) here\nsecond";

  it("emits a cm-md-link mark decoration covering the Link node", () => {
    const state = makeState(doc, doc.length);
    const decs = buildLinkDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs);
    expect(marks.length).toBeGreaterThanOrEqual(1);
    // リンクテキスト "[example](https://example.com)" はドキュメント内 4〜34 の範囲
    const mark = marks[0];
    expect(mark.from).toBe(4);
    expect(mark.to).toBe(34);
  });

  it("emits replace decorations for LinkMark and URL children", () => {
    const state = makeState(doc, doc.length);
    const decs = buildLinkDecorations(state, makeFakeView(state));
    const replaceDecs = getReplaceDecs(decs);
    // LinkMark: "[", "]", "(", ")" の各 1 文字 × 4 個 = 4 個
    // または lezer が [ ] ( ) をまとめるなら適宜調整
    // URL: "https://example.com" の 1 個
    // 合計 3〜5 個を想定（実装依存）
    expect(replaceDecs.length).toBeGreaterThanOrEqual(1);
    // URL を含むことを確認（URL の範囲を文字列で検証）
    const urlStart = doc.indexOf("https://example.com");
    const urlEnd = urlStart + "https://example.com".length;
    const urlDec = replaceDecs.find(
      (d) => d.from === urlStart && d.to === urlEnd
    );
    expect(urlDec).toBeDefined();
  });
});

// ---------------------------------------------------------------
// カーソルがリンク内にある場合
// ---------------------------------------------------------------
describe("buildLinkDecorations — cursor inside link", () => {
  // カーソルをリンクテキスト "[example]" の内部（position 6）に配置
  const doc = "see [example](https://example.com) here\nsecond";

  it("emits cm-md-link mark decoration even when cursor is inside", () => {
    const state = makeState(doc, 6);
    const decs = buildLinkDecorations(state, makeFakeView(state));
    const marks = getMarkDecs(decs);
    expect(marks.length).toBeGreaterThanOrEqual(1);
  });

  it("does NOT emit replace decorations when cursor is inside link", () => {
    const state = makeState(doc, 6);
    const decs = buildLinkDecorations(state, makeFakeView(state));
    const replaceDecs = getReplaceDecs(decs);
    expect(replaceDecs.length).toBe(0);
  });
});
