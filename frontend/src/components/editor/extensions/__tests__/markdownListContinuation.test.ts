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
});
