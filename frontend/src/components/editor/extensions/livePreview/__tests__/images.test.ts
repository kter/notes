/**
 * buildImageDecorations のユニットテスト。
 * Image ノードに対して ImageWidget replace デコレーションが
 * 正しく生成されることを検証する。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { buildImageDecorations, ImageWidget } from "../images";

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

/** widget を持つ replace デコレーションを取得する */
function getWidgetDecs(decs: Range<Decoration>[]): Range<Decoration>[] {
  return decs.filter(
    (d) =>
      (d.value.spec as { widget?: unknown }).widget !== undefined
  );
}

/** デコレーションから ImageWidget を取得する */
function getImageWidget(dec: Range<Decoration>): unknown {
  return (dec.value as unknown as { spec: { widget: unknown } }).spec.widget;
}

// ---------------------------------------------------------------
// カーソルが画像行の外にある場合
// ---------------------------------------------------------------
describe("buildImageDecorations — cursor away from image line", () => {
  const doc = "![alt text](https://example.com/img.png)\nnext line";
  // cursor at end of line 2 (away from image)
  const cursorPos = doc.length;

  it("emits one replace decoration with ImageWidget covering the Image node", () => {
    const state = makeState(doc, cursorPos);
    const decs = buildImageDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    expect(widgets.length).toBe(1);
    // Image node spans the entire "![alt text](https://example.com/img.png)" = 0〜40
    expect(widgets[0].from).toBe(0);
    expect(widgets[0].to).toBe(40);
  });

  it("widget is an ImageWidget with correct url", () => {
    const state = makeState(doc, cursorPos);
    const decs = buildImageDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    const widget = getImageWidget(widgets[0]);
    expect(widget).toBeInstanceOf(ImageWidget);
    const imgWidget = widget as ImageWidget;
    // eq を使って url と alt を検証
    const expected = new ImageWidget(
      "https://example.com/img.png",
      "alt text"
    );
    expect(imgWidget.eq(expected)).toBe(true);
  });

  it("widget has correct alt text", () => {
    const state = makeState(doc, cursorPos);
    const decs = buildImageDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    const widget = getImageWidget(widgets[0]) as ImageWidget;
    const wrongAlt = new ImageWidget("https://example.com/img.png", "wrong");
    expect(widget.eq(wrongAlt)).toBe(false);
  });
});

// ---------------------------------------------------------------
// カーソルが画像行にある場合
// ---------------------------------------------------------------
describe("buildImageDecorations — cursor on image line", () => {
  const doc = "![alt text](https://example.com/img.png)\nnext line";
  // cursor at position 5 (inside the image line)
  const cursorPos = 5;

  it("emits NO replace decorations when cursor is on image line", () => {
    const state = makeState(doc, cursorPos);
    const decs = buildImageDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    expect(widgets.length).toBe(0);
  });
});

// ---------------------------------------------------------------
// ImageWidget.eq
// ---------------------------------------------------------------
describe("ImageWidget.eq", () => {
  it("returns true for equal widgets", () => {
    const w1 = new ImageWidget("https://example.com/a.png", "alt");
    const w2 = new ImageWidget("https://example.com/a.png", "alt");
    expect(w1.eq(w2)).toBe(true);
  });

  it("returns false when url differs", () => {
    const w1 = new ImageWidget("https://example.com/a.png", "alt");
    const w2 = new ImageWidget("https://example.com/b.png", "alt");
    expect(w1.eq(w2)).toBe(false);
  });

  it("returns false when alt differs", () => {
    const w1 = new ImageWidget("https://example.com/a.png", "alt1");
    const w2 = new ImageWidget("https://example.com/a.png", "alt2");
    expect(w1.eq(w2)).toBe(false);
  });
});
