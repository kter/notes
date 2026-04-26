import { EditorSelection } from "@codemirror/state";
import { EditorView, type KeyBinding } from "@codemirror/view";

const INDENT = "  ";
const LIST_LINE_RE = /^(\s*)([-*+]|\d+\.)\s/;
const INDENTED_LINE_RE = /^\s+/;
const LEADING_INDENT_RE = /^(\s{1,2})/;

function indentCommand(view: EditorView): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;

  // Multi-line selection: indent each line
  if (from !== to) {
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    if (startLine.number !== endLine.number) {
      const changes = [];
      for (let n = startLine.number; n <= endLine.number; n++) {
        const line = state.doc.line(n);
        changes.push({ from: line.from, insert: INDENT });
      }
      const lineCount = endLine.number - startLine.number + 1;
      view.dispatch(state.update({
        changes,
        selection: EditorSelection.range(
          from + INDENT.length,
          to + INDENT.length * lineCount
        ),
        userEvent: "input.indent",
      }));
      return true;
    }
  }

  // Single line
  const line = state.doc.lineAt(from);
  const isListLine = LIST_LINE_RE.test(line.text);
  const isIndentedLine = INDENTED_LINE_RE.test(line.text);

  if (isListLine || isIndentedLine) {
    // Insert indent at line start
    view.dispatch(state.update({
      changes: { from: line.from, insert: INDENT },
      selection: EditorSelection.cursor(from + INDENT.length),
      userEvent: "input.indent",
    }));
  } else {
    // Insert 2 spaces at cursor position
    view.dispatch(state.update({
      changes: { from, insert: INDENT },
      selection: EditorSelection.cursor(from + INDENT.length),
      userEvent: "input",
    }));
  }
  return true;
}

function unindentCommand(view: EditorView): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;

  // Multi-line selection: remove up to 2 leading spaces from each line
  if (from !== to) {
    const startLine = state.doc.lineAt(from);
    const endLine = state.doc.lineAt(to);
    if (startLine.number !== endLine.number) {
      const changes: { from: number; to: number }[] = [];
      let removedTotal = 0;
      let removedFirst = 0;
      for (let n = startLine.number; n <= endLine.number; n++) {
        const line = state.doc.line(n);
        const m = line.text.match(LEADING_INDENT_RE);
        const len = m ? m[1].length : 0;
        if (len > 0) {
          changes.push({ from: line.from, to: line.from + len });
          removedTotal += len;
          if (n === startLine.number) removedFirst = len;
        }
      }
      if (changes.length === 0) return true;
      view.dispatch(state.update({
        changes,
        selection: EditorSelection.range(
          Math.max(startLine.from, from - removedFirst),
          to - removedTotal
        ),
        userEvent: "delete.dedent",
      }));
      return true;
    }
  }

  // Single line: remove 1–2 leading spaces
  const line = state.doc.lineAt(from);
  const m = line.text.match(LEADING_INDENT_RE);
  if (!m) return true;
  const len = m[1].length;
  view.dispatch(state.update({
    changes: { from: line.from, to: line.from + len },
    selection: EditorSelection.cursor(Math.max(line.from, from - len)),
    userEvent: "delete.dedent",
  }));
  return true;
}

export const markdownIndentKeymap: KeyBinding[] = [
  { key: "Tab", run: indentCommand, shift: unindentCommand },
];
