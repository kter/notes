import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  handleTextPasteWithoutTrailingLineBreak,
  stripOneTrailingLineBreak,
} from "../paste";

function makeView(doc = "", anchor = doc.length, head = anchor): EditorView {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: EditorSelection.range(anchor, head),
    }),
    parent: document.body,
  });
}

function makePasteEvent(text: string): {
  event: ClipboardEvent;
  preventDefault: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  const event = {
    clipboardData: {
      getData: (type: string) => (type === "text/plain" ? text : ""),
    },
    preventDefault,
  } as unknown as ClipboardEvent;

  return { event, preventDefault };
}

describe("stripOneTrailingLineBreak", () => {
  it.each([
    ["pasted line\n", "pasted line"],
    ["pasted line\r\n", "pasted line"],
    ["pasted line\r", "pasted line"],
  ])("removes one trailing line break from %j", (text, expected) => {
    expect(stripOneTrailingLineBreak(text)).toBe(expected);
  });

  it("preserves preceding blank lines when multiple line breaks are present", () => {
    expect(stripOneTrailingLineBreak("pasted line\n\n")).toBe("pasted line\n");
  });

  it("does not change text without a trailing line break", () => {
    expect(stripOneTrailingLineBreak("pasted line")).toBe("pasted line");
  });
});

describe("handleTextPasteWithoutTrailingLineBreak", () => {
  let view: EditorView;

  afterEach(() => {
    view.destroy();
  });

  it("replaces the selection and consumes paste with a trailing line break", () => {
    view = makeView("before after", 0, 6);
    const { event, preventDefault } = makePasteEvent("pasted\n");

    expect(handleTextPasteWithoutTrailingLineBreak(event, view)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(view.state.doc.toString()).toBe("pasted after");
    expect(view.state.selection.main.anchor).toBe(6);
  });

  it("leaves ordinary paste to CodeMirror's default handler", () => {
    view = makeView();
    const { event, preventDefault } = makePasteEvent("pasted");

    expect(handleTextPasteWithoutTrailingLineBreak(event, view)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe("");
  });
});
