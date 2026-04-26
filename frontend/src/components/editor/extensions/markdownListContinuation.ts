import { EditorSelection } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";

const LIST_MARKER_RE = /^(\s*)([-*+]|\d+\.)?(\s*)/;

interface ListMarkerInfo {
  fullMatch: string;
  indent: string;
  marker: string | undefined;
  markerSpace: string;
  contentAfterMarker: string;
}

function getListMarkerInfo(text: string): ListMarkerInfo | null {
  const m = text.match(LIST_MARKER_RE);
  if (!m) return null;
  const [fullMatch, indent, marker, markerSpace] = m;
  return {
    fullMatch,
    indent: indent ?? "",
    marker,
    markerSpace: markerSpace ?? "",
    contentAfterMarker: text.slice(fullMatch.length),
  };
}

function enterCommand(view: EditorView): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) return false;

  const line = state.doc.lineAt(from);
  const beforeCursor = state.doc.sliceString(line.from, from);
  const info = getListMarkerInfo(beforeCursor);
  if (!info || !info.marker) return false;

  const { indent, marker, markerSpace, contentAfterMarker } = info;

  // Empty list item — remove the marker and just insert a newline
  const afterCursor = state.doc.sliceString(from, line.to);
  if (contentAfterMarker.trim() === "" && afterCursor.trim() === "") {
    view.dispatch(state.update({
      changes: { from: line.from, to: from, insert: "\n" },
      selection: EditorSelection.cursor(line.from + 1),
      userEvent: "input",
    }));
    return true;
  }

  // Build the continuation prefix
  let continuation = indent;
  const numMatch = marker.match(/^(\d+)\.$/);
  if (numMatch) {
    continuation += (parseInt(numMatch[1], 10) + 1) + "." + markerSpace;
  } else {
    continuation += marker + markerSpace;
  }

  const insert = "\n" + continuation;
  view.dispatch(state.update({
    changes: { from, insert },
    selection: EditorSelection.cursor(from + insert.length),
    userEvent: "input",
    scrollIntoView: true,
  }));
  return true;
}

export const markdownListContinuationKeymap: KeyBinding[] = [
  { key: "Enter", run: enterCommand },
];
