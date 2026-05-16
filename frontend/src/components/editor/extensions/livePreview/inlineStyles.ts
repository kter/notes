/**
 * Markdown インライン構文（太字・斜体・取り消し線・コード）に対して
 * CM6 デコレーションを生成する関数を提供する。
 * カーソルがノード内にある場合はマーカーを表示し、そうでない場合は非表示にする。
 *
 * 主なエクスポート:
 * - buildInlineDecorations: 現在の EditorState と EditorView から Range<Decoration>[] を返す
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isCursorInRange } from "./cursorRange";

/**
 * 可視範囲内の Markdown インライン構文ノードを走査し、
 * 装飾用 Range<Decoration>[] を返す。
 * RangeSetBuilder に渡す前に from 昇順でソートして返す。
 */
export function buildInlineDecorations(
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
        const { name, from: nFrom, to: nTo } = node;

        if (name === "StrongEmphasis") {
          decorations.push(
            Decoration.mark({ class: "cm-md-strong" }).range(nFrom, nTo)
          );
          if (!isCursorInRange(state, nFrom, nTo)) {
            decorations.push(Decoration.replace({}).range(nFrom, nFrom + 2));
            decorations.push(Decoration.replace({}).range(nTo - 2, nTo));
          } else {
            decorations.push(Decoration.mark({ class: "cm-md-marker" }).range(nFrom, nFrom + 2));
            decorations.push(Decoration.mark({ class: "cm-md-marker" }).range(nTo - 2, nTo));
          }
        } else if (name === "Emphasis") {
          decorations.push(
            Decoration.mark({ class: "cm-md-em" }).range(nFrom, nTo)
          );
          if (!isCursorInRange(state, nFrom, nTo)) {
            decorations.push(Decoration.replace({}).range(nFrom, nFrom + 1));
            decorations.push(Decoration.replace({}).range(nTo - 1, nTo));
          } else {
            decorations.push(Decoration.mark({ class: "cm-md-marker" }).range(nFrom, nFrom + 1));
            decorations.push(Decoration.mark({ class: "cm-md-marker" }).range(nTo - 1, nTo));
          }
        } else if (name === "Strikethrough") {
          decorations.push(
            Decoration.mark({ class: "cm-md-strikethrough" }).range(nFrom, nTo)
          );
          if (!isCursorInRange(state, nFrom, nTo)) {
            decorations.push(Decoration.replace({}).range(nFrom, nFrom + 2));
            decorations.push(Decoration.replace({}).range(nTo - 2, nTo));
          } else {
            decorations.push(Decoration.mark({ class: "cm-md-marker" }).range(nFrom, nFrom + 2));
            decorations.push(Decoration.mark({ class: "cm-md-marker" }).range(nTo - 2, nTo));
          }
        } else if (name === "InlineCode") {
          const text = state.sliceDoc(nFrom, nTo);
          let tickLen = 0;
          while (tickLen < text.length && text[tickLen] === "`") {
            tickLen++;
          }
          const contentFrom = nFrom + tickLen;
          const contentTo = nTo - tickLen;
          // Apply mark to code content only (excluding backticks) to avoid
          // nextLayer placement when mark and replace share the same `from`.
          if (contentFrom < contentTo) {
            decorations.push(
              Decoration.mark({ class: "cm-md-code" }).range(contentFrom, contentTo)
            );
          }
          if (!isCursorInRange(state, nFrom, nTo)) {
            if (tickLen > 0) {
              decorations.push(Decoration.replace({}).range(nFrom, contentFrom));
              decorations.push(Decoration.replace({}).range(contentTo, nTo));
            }
          } else {
            if (tickLen > 0) {
              decorations.push(Decoration.mark({ class: "cm-md-marker" }).range(nFrom, contentFrom));
              decorations.push(Decoration.mark({ class: "cm-md-marker" }).range(contentTo, nTo));
            }
          }
        }
      },
    });
  }

  // RangeSetBuilder requires ranges sorted by `from` ascending
  decorations.sort((a, b) => a.from - b.from || a.to - b.to);

  return decorations;
}
