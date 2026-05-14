/**
 * Markdown フェンスコードブロック（``` ... ```）に対して
 * CM6 ラインデコレーションを生成する。
 * カーソルが離れたフェンス行（``` 行）は Decoration.replace で隠蔽する。
 *
 * 主なエクスポート:
 * - buildCodeBlockDecorations: EditorState と EditorView から Range<Decoration>[] を返す
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isCursorOnLine } from "./cursorRange";

/**
 * 可視範囲内の FencedCode ノードを走査し、
 * ブロック内の全行に cm-md-fenced ラインデコレーションを付与する。
 * カーソルが離れた開き・閉じフェンス行は replace デコレーションで隠蔽する。
 */
export function buildCodeBlockDecorations(
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
        if (node.name !== "FencedCode") return;

        const { from: nFrom, to: nTo } = node;

        const openLine = state.doc.lineAt(nFrom);
        // nTo は閉じフェンス行末の次位置になることがあるため nTo-1 で行を特定
        const closeLine = state.doc.lineAt(nTo > nFrom ? nTo - 1 : nFrom);

        // FencedCode 範囲内の全行にラインデコレーションを付与
        let linePos = nFrom;
        while (linePos <= nTo) {
          const line = state.doc.lineAt(linePos);
          decorations.push(
            Decoration.line({ class: "cm-md-fenced" }).range(line.from)
          );
          if (line.to >= nTo) break;
          linePos = line.to + 1;
        }

        // 開き・閉じフェンス行をカーソルが離れているときに隠蔽（HR と同方針）
        if (openLine.number !== closeLine.number) {
          if (!isCursorOnLine(state, openLine.from)) {
            decorations.push(
              Decoration.replace({}).range(openLine.from, openLine.to)
            );
          }
          if (!isCursorOnLine(state, closeLine.from)) {
            decorations.push(
              Decoration.replace({}).range(closeLine.from, closeLine.to)
            );
          }
        }

        return false; // 子ノードの重複走査を避ける
      },
    });
  }

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return decorations;
}
