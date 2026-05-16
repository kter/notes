import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { markdownIndentKeymap } from "../markdownIndent";

const tabRun = markdownIndentKeymap[0].run!;
const shiftTabRun = markdownIndentKeymap[0].shift!;

function makeView(doc: string, anchor: number, head = anchor): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
  });
  return new EditorView({ state, parent: document.body });
}

describe("markdownIndent — Tab", () => {
  let view: EditorView;

  afterEach(() => { view.destroy(); });

  it("inserts 2 spaces at cursor for a plain line", () => {
    view = makeView("hello", 3); // "hel|lo"
    tabRun(view);
    expect(view.state.doc.toString()).toBe("hel  lo");
    expect(view.state.selection.main.from).toBe(5);
  });

  it("inserts indent at line start for a list line", () => {
    view = makeView("- item", 3); // "- i|tem"
    tabRun(view);
    expect(view.state.doc.toString()).toBe("  - item");
    expect(view.state.selection.main.from).toBe(5); // 3 + 2
  });

  it("inserts indent at line start for an already-indented line", () => {
    view = makeView("  text", 4); // "  te|xt"
    tabRun(view);
    expect(view.state.doc.toString()).toBe("    text");
    expect(view.state.selection.main.from).toBe(6); // 4 + 2
  });

  it("indents all lines in a multi-line selection", () => {
    // doc: "aa\nbb\ncc", select all
    const doc = "aa\nbb\ncc";
    view = makeView(doc, 0, doc.length); // full selection
    tabRun(view);
    expect(view.state.doc.toString()).toBe("  aa\n  bb\n  cc");
  });

  it("returns true to consume the event", () => {
    view = makeView("hello", 0);
    expect(tabRun(view)).toBe(true);
  });

  it("resets ordered list number to 1 when no items at new indent level", () => {
    view = makeView("2. item", 7); // cursor at end
    tabRun(view);
    expect(view.state.doc.toString()).toBe("  1. item");
    expect(view.state.selection.main.from).toBe(9); // 7 + (4 - 2)
  });

  it("continues ordered list number from previous item at same indent level", () => {
    const doc = "  1. nested\n2. other";
    view = makeView(doc, doc.length); // cursor at end of "2. other"
    tabRun(view);
    expect(view.state.doc.toString()).toBe("  1. nested\n  2. other");
    expect(view.state.selection.main.from).toBe(22); // 20 + 2
  });
});

describe("markdownIndent — Shift+Tab", () => {
  let view: EditorView;

  afterEach(() => { view.destroy(); });

  it("removes up to 2 leading spaces on a single line", () => {
    view = makeView("  hello", 4); // "  he|llo"
    shiftTabRun(view);
    expect(view.state.doc.toString()).toBe("hello");
    expect(view.state.selection.main.from).toBe(2); // 4 - 2
  });

  it("removes 1 space when only 1 leading space exists", () => {
    view = makeView(" hello", 3); // " he|llo"
    shiftTabRun(view);
    expect(view.state.doc.toString()).toBe("hello");
    expect(view.state.selection.main.from).toBe(2); // 3 - 1
  });

  it("is a no-op (consume) on a line with no leading spaces", () => {
    view = makeView("hello", 2);
    const result = shiftTabRun(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toBe("hello");
  });

  it("removes indent from each line in a multi-line selection", () => {
    const doc = "  aa\n  bb\n  cc";
    view = makeView(doc, 0, doc.length);
    shiftTabRun(view);
    expect(view.state.doc.toString()).toBe("aa\nbb\ncc");
  });

  it("returns true to consume the event", () => {
    view = makeView("  hello", 0);
    expect(shiftTabRun(view)).toBe(true);
  });

  it("corrects ordered list number at parent level on unindent", () => {
    const doc = "1. parent\n  1. nested";
    view = makeView(doc, doc.length); // cursor at end of "  1. nested"
    shiftTabRun(view);
    expect(view.state.doc.toString()).toBe("1. parent\n2. nested");
    expect(view.state.selection.main.from).toBe(19); // 21 + (2 - 4)
  });

  it("is a no-op for top-level ordered list item", () => {
    view = makeView("1. item", 7);
    expect(shiftTabRun(view)).toBe(true);
    expect(view.state.doc.toString()).toBe("1. item");
  });
});
