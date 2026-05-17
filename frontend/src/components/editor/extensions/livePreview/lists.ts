/**
 * Markdown 箇条書き（BulletList）および番号付きリスト（OrderedList）に対して
 * CM6 デコレーションを生成する。
 *
 * カーソルが同じ行にある ListMark には装飾を付与しない。
 * Raw Edit モードと同様に、編集中の行は CM6 本来のシンタックスハイライトだけで表示する。
 * これにより、IME 変換中に mark スパンが挿入位置付近に存在することで起きる
 * カーソルドリフト不具合（Issue #89）を回避する。
 *
 * カーソルが別行にある ListMark には Decoration.mark を付与する（replace は使わない）。
 * Decoration.replace（widget）は IME composition と組み合わせると DOM/Selection の
 * ズレを引き起こすため廃止した。
 *
 * タスクリストマーカー（TaskMarker）はここでは扱わない。taskList.ts が担当する。
 *
 * 主なエクスポート:
 * - buildListDecorations: EditorState と EditorView から Range<Decoration>[] を返す
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isCursorOnLine } from "./cursorRange";

/**
 * 可視範囲内の BulletList / OrderedList ノードを走査し、
 * カーソルがいない行の ListMark に対してデコレーションを返す。
 */
export function buildListDecorations(
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
        if (node.name === "BulletList") {
          let item = node.node.firstChild;
          while (item) {
            if (item.name === "ListItem") {
              let child = item.firstChild;
              while (child) {
                if (child.name === "ListMark") {
                  // カーソル行は装飾しない（Raw Edit と同じ見た目 → IME 干渉なし）
                  if (!isCursorOnLine(state, child.from)) {
                    decorations.push(
                      Decoration.mark({ class: "cm-md-bullet" }).range(child.from, child.to)
                    );
                  }
                  break;
                }
                child = child.nextSibling;
              }
            }
            item = item.nextSibling;
          }
          return false;
        }

        if (node.name === "OrderedList") {
          let item = node.node.firstChild;
          while (item) {
            if (item.name === "ListItem") {
              let child = item.firstChild;
              while (child) {
                if (child.name === "ListMark") {
                  // カーソル行は装飾しない
                  if (!isCursorOnLine(state, child.from)) {
                    decorations.push(
                      Decoration.mark({ class: "cm-md-ol-mark" }).range(child.from, child.to)
                    );
                  }
                  break;
                }
                child = child.nextSibling;
              }
            }
            item = item.nextSibling;
          }
          return false;
        }
      },
    });
  }

  decorations.sort(
    (a, b) => a.from - b.from || a.value.startSide - b.value.startSide
  );
  return decorations;
}
