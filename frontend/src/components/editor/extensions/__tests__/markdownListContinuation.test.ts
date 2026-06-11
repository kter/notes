import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { markdownListContinuationKeymap } from "../markdownListContinuation";

const enterRun = markdownListContinuationKeymap[0].run!;

function makeView(doc: string, anchor: number, head = anchor): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
  });
  return new EditorView({ state, parent: document.body });
}

describe("markdownListContinuation — Enter", () => {
  let view: EditorView;

  afterEach(() => { view.destroy(); });

  it("continues an unordered list with -", () => {
    view = makeView("- item", 6); // cursor at end
    enterRun(view);
    expect(view.state.doc.toString()).toBe("- item\n- ");
    expect(view.state.selection.main.from).toBe(9);
  });

  it("continues an unordered list with *", () => {
    view = makeView("* item", 6);
    enterRun(view);
    expect(view.state.doc.toString()).toBe("* item\n* ");
  });

  it("continues an unordered list with +", () => {
    view = makeView("+ item", 6);
    enterRun(view);
    expect(view.state.doc.toString()).toBe("+ item\n+ ");
  });

  it("increments the number in an ordered list", () => {
    view = makeView("1. item", 7);
    enterRun(view);
    expect(view.state.doc.toString()).toBe("1. item\n2. ");
  });

  it("increments from a higher number", () => {
    view = makeView("5. item", 7);
    enterRun(view);
    expect(view.state.doc.toString()).toBe("5. item\n6. ");
  });

  it("removes marker on an empty unordered list item", () => {
    view = makeView("- ", 2); // cursor after "- ", nothing else
    enterRun(view);
    expect(view.state.doc.toString()).toBe("\n");
  });

  it("removes marker on an empty ordered list item", () => {
    view = makeView("1. ", 3);
    enterRun(view);
    expect(view.state.doc.toString()).toBe("\n");
  });

  it("preserves indentation in a nested list", () => {
    view = makeView("  - item", 8);
    enterRun(view);
    expect(view.state.doc.toString()).toBe("  - item\n  - ");
  });

  it("returns false for a plain (non-list) line", () => {
    view = makeView("hello world", 5);
    expect(enterRun(view)).toBe(false);
    expect(view.state.doc.toString()).toBe("hello world"); // unchanged
  });

  it("returns false when text is selected", () => {
    view = makeView("- item", 2, 5); // selection
    expect(enterRun(view)).toBe(false);
  });

  it("returns true to consume for a list line", () => {
    view = makeView("- item", 6);
    expect(enterRun(view)).toBe(true);
  });

  it("continues a GFM task list line as a list (marker carried to next line)", () => {
    // この拡張単体ではチェックボックス `[ ]` を引き継がず `- ` のみ継続する。
    // 実エディタでは @codemirror/lang-markdown の Prec.high キーマップ
    // (insertNewlineContinueMarkup) が先に Enter を処理するため `- [ ] ` が継続される
    // （E2E: tests/regression/markdown-typing.spec.ts が実挙動を担保）。
    view = makeView("- [ ] task", 10);
    expect(enterRun(view)).toBe(true);
    const lines = view.state.doc.toString().split("\n");
    expect(lines[0]).toBe("- [ ] task");
    expect(lines[1]).toMatch(/^- /);
  });

  it("continues mid-line: text after cursor stays on the original line", () => {
    // "- item" でカーソルが "it|em" の位置 — 改行後 "em" は次行へ移動せず
    // 現実装は beforeCursor のみで継続行を作るため "em" は元の行末に残る
    view = makeView("- item", 4);
    enterRun(view);
    expect(view.state.doc.toString()).toBe("- it\n- em");
  });

  it("does not continue when cursor is before the marker", () => {
    // 行頭（マーカーより前）で Enter — マーカー情報が beforeCursor に無いので false
    view = makeView("- item", 0);
    expect(enterRun(view)).toBe(false);
  });
});
