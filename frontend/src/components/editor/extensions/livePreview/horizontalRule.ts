/**
 * Markdown 水平線（---, ***, ___）に対して
 * ラインデコレーションを生成する。
 * カーソルが同じ行にある場合は生のマークダウンを表示する。
 * カーソルが離れている場合は --- テキストを非表示にし、CSS ::after で水平線を描画する。
 *
 * 主なエクスポート:
 * - buildHorizontalRuleDecorations: EditorState と EditorView から Range<Decoration>[] を返す
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isCursorOnLine } from "./cursorRange";

/**
 * 可視範囲内の HorizontalRule ノードを走査し、
 * カーソルが離れている場合にラインデコレーション + テキスト非表示を返す。
 * block: true ウィジェットは ViewPlugin では不安定なため、line decoration + CSS で実装する。
 */
export function buildHorizontalRuleDecorations(
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
        if (node.name !== "HorizontalRule") return;

        const { from: nFrom, to: nTo } = node;

        // カーソルが水平線と同じ行にある場合は生のマークダウンを表示
        if (isCursorOnLine(state, nFrom)) return;

        const line = state.doc.lineAt(nFrom);

        // ライン全体に cm-md-hr-line クラスを付与（CSS ::after で水平線を描画）
        decorations.push(
          Decoration.line({ class: "cm-md-hr-line" }).range(line.from)
        );
        // --- テキスト自体を非表示にする
        decorations.push(
          Decoration.replace({}).range(nFrom, nTo)
        );
      },
    });
  }

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return decorations;
}
