/**
 * Markdown ブロッククォート（> プレフィックス）に対して
 * CM6 ラインデコレーションおよび QuoteMark 非表示デコレーションを生成する。
 *
 * 主なエクスポート:
 * - buildBlockquoteDecorations: EditorState と EditorView から Range<Decoration>[] を返す
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isCursorOnLine } from "./cursorRange";

/**
 * 可視範囲内の Blockquote ノードを走査し、
 * ラインデコレーションおよび QuoteMark 非表示デコレーションを返す。
 */
export function buildBlockquoteDecorations(
  state: EditorState,
  view: EditorView
): Range<Decoration>[] {
  const tree = syntaxTree(state);
  const decorations: Range<Decoration>[] = [];

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name !== "Blockquote") return;

        const { from: nFrom, to: nTo } = node;

        // Blockquote 範囲内の全行にラインデコレーションを付与
        let linePos = nFrom;
        while (linePos <= nTo) {
          const line = state.doc.lineAt(linePos);
          decorations.push(
            Decoration.line({ class: "cm-md-blockquote" }).range(line.from)
          );
          if (line.to >= nTo) break;
          linePos = line.to + 1;
        }

        // QuoteMark 子ノード（"> " プレフィックス）を収集して非表示にする
        let cursor = node.node.firstChild;
        while (cursor) {
          if (cursor.name === "QuoteMark") {
            // カーソルが QuoteMark と同じ行にない場合は非表示
            if (!isCursorOnLine(state, cursor.from)) {
              decorations.push(
                Decoration.replace({}).range(cursor.from, cursor.to)
              );
            }
          }
          cursor = cursor.nextSibling;
        }

        return false; // 子ノードの重複走査を避ける
      },
    });
  }

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return decorations;
}
