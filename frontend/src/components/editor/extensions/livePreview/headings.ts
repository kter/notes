/**
 * Markdown 見出し（ATX: #〜######、Setext: === / ---）に対して
 * CM6 ラインデコレーションおよびマーカー非表示デコレーションを生成する。
 *
 * 主なエクスポート:
 * - buildHeadingDecorations: EditorState と EditorView から Range<Decoration>[] を返す
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isCursorOnLine } from "./cursorRange";

/** ATX 見出しレベルとCSSクラスのマッピング */
const ATX_HEADING_CLASSES: Record<string, string> = {
  ATXHeading1: "cm-md-h1",
  ATXHeading2: "cm-md-h2",
  ATXHeading3: "cm-md-h3",
  ATXHeading4: "cm-md-h4",
  ATXHeading5: "cm-md-h5",
  ATXHeading6: "cm-md-h6",
};

/** Setext 見出しレベルとCSSクラスのマッピング */
const SETEXT_HEADING_CLASSES: Record<string, string> = {
  SetextHeading1: "cm-md-h1",
  SetextHeading2: "cm-md-h2",
};

/** Setext アンダーライン行に付与するCSSクラス */
const SETEXT_UNDERLINE_CLASSES: Record<string, string> = {
  SetextHeading1: "cm-md-h1-underline",
  SetextHeading2: "cm-md-h2-underline",
};

/**
 * 可視範囲内の Markdown 見出しノードを走査し、
 * ラインデコレーションおよびマーカー非表示デコレーションを返す。
 */
export function buildHeadingDecorations(
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

        // ATX 見出し (#, ##, ... ######)
        if (name in ATX_HEADING_CLASSES) {
          const cls = ATX_HEADING_CLASSES[name];

          // 見出し範囲内の全行にラインデコレーションを付与
          let linePos = nFrom;
          while (linePos <= nTo) {
            const line = state.doc.lineAt(linePos);
            decorations.push(
              Decoration.line({ class: cls }).range(line.from)
            );
            if (line.to >= nTo) break;
            linePos = line.to + 1;
          }

          // HeaderMark 子ノード（# + スペース）を検索
          let cursor = node.node.firstChild;
          while (cursor) {
            if (cursor.name === "HeaderMark") {
              // カーソルが HeaderMark と同じ行にない場合は非表示
              if (!isCursorOnLine(state, cursor.from)) {
                decorations.push(
                  Decoration.replace({}).range(cursor.from, cursor.to)
                );
              }
              break;
            }
            cursor = cursor.nextSibling;
          }

          return false; // 子ノードの重複走査を避ける
        }

        // Setext 見出し (=== / --- アンダーライン形式)
        if (name in SETEXT_HEADING_CLASSES) {
          const cls = SETEXT_HEADING_CLASSES[name];
          const underlineCls = SETEXT_UNDERLINE_CLASSES[name];

          // 見出しテキスト行とアンダーライン行を区別するため
          // SetextHeading 範囲内の行を走査する
          let linePos = nFrom;
          let isFirstLine = true;
          while (linePos <= nTo) {
            const line = state.doc.lineAt(linePos);
            if (isFirstLine) {
              // テキスト行: 見出しクラスを付与
              decorations.push(
                Decoration.line({ class: cls }).range(line.from)
              );
              isFirstLine = false;
            } else {
              // アンダーライン行: アンダーラインクラスを付与
              decorations.push(
                Decoration.line({ class: underlineCls }).range(line.from)
              );
            }
            if (line.to >= nTo) break;
            linePos = line.to + 1;
          }

          return false;
        }
      },
    });
  }

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
  return decorations;
}
