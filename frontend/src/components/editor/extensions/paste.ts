import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

const TRAILING_LINE_BREAK = /(?:\r\n|\r|\n)$/;

export function stripOneTrailingLineBreak(text: string): string {
  return text.replace(TRAILING_LINE_BREAK, "");
}

export function handleTextPasteWithoutTrailingLineBreak(
  event: ClipboardEvent,
  view: EditorView
): boolean {
  const text = event.clipboardData?.getData("text/plain");
  if (!text) return false;

  const textWithoutTrailingLineBreak = stripOneTrailingLineBreak(text);
  if (textWithoutTrailingLineBreak === text) return false;

  event.preventDefault();
  view.dispatch({
    ...view.state.replaceSelection(textWithoutTrailingLineBreak),
    annotations: Transaction.userEvent.of("input.paste"),
    scrollIntoView: true,
  });
  return true;
}
