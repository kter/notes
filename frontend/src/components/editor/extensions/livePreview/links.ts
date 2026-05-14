/**
 * Markdown リンク（[text](url)）に対して CM6 デコレーションを生成する。
 * カーソルがリンクノード外にある場合はブラケット/パーレン・URL を非表示にし、
 * リンクテキストのみ cm-md-link クラスでスタイルする。
 *
 * 主なエクスポート:
 * - buildLinkDecorations: EditorState と EditorView から Range<Decoration>[] を返す
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isCursorInRange } from "./cursorRange";

/**
 * 可視範囲内の Link ノードを走査し、デコレーション Range 配列を返す。
 * カーソルがリンク範囲外のとき、LinkMark と URL 子ノードを replace で隠す。
 */
export function buildLinkDecorations(
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
        if (node.name !== "Link") return;

        const { from: nFrom, to: nTo } = node;

        // リンク全体に cm-md-link クラスを付与（常時）
        decorations.push(
          Decoration.mark({ class: "cm-md-link" }).range(nFrom, nTo)
        );

        // カーソルがリンク範囲外の場合、マーカーと URL を非表示にする
        if (!isCursorInRange(state, nFrom, nTo)) {
          let child = node.node.firstChild;
          while (child) {
            if (child.name === "LinkMark") {
              decorations.push(
                Decoration.replace({}).range(child.from, child.to)
              );
            } else if (child.name === "URL") {
              decorations.push(
                Decoration.replace({}).range(child.from, child.to)
              );
            }
            child = child.nextSibling;
          }
        }

        return false; // 子ノードの重複走査を避ける
      },
    });
  }

  decorations.sort(
    (a, b) => a.from - b.from || a.value.startSide - b.value.startSide
  );
  return decorations;
}
