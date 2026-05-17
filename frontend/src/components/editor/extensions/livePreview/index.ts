/**
 * ライブプレビュー拡張のエントリポイント。
 * インラインスタイル（太字・斜体・取り消し線・コード）をリアルタイムで装飾する
 * ViewPlugin とベーステーマをまとめて返す。
 *
 * 主なエクスポート:
 * - livePreview(): CM6 拡張の配列を返す関数
 *
 * 呼び出し関係: MarkdownEditor.tsx の extensions 配列に展開して使用される。
 */
import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type ViewUpdate,
  EditorView,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { buildInlineDecorations } from "./inlineStyles";
import { buildHeadingDecorations } from "./headings";
import { buildBlockquoteDecorations } from "./blockquote";
import { buildHorizontalRuleDecorations } from "./horizontalRule";
import { buildCodeBlockDecorations } from "./codeBlocks";
import { buildListDecorations } from "./lists";
import { buildTaskDecorations } from "./taskList";
import { buildLinkDecorations } from "./links";
import { buildImageDecorations } from "./images";
import { livePreviewBaseTheme } from "./theme";

/**
 * インライン装飾を管理する共有 ViewPlugin。
 * docChanged・viewportChanged・selectionSet のいずれかで再構築する。
 * IME 変換中 (composing) は更新をスキップしてちらつきを防ぐ。
 */
const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      // Also rebuild when the syntax tree changes (async parse completion)
      const treeChanged =
        syntaxTree(update.state) !== syntaxTree(update.startState);
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        treeChanged
      ) {
        if (!update.view.composing) {
          this.decorations = this.build(update.view);
        }
      }
    }

    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const allRanges = [
        ...buildInlineDecorations(view.state, view),
        ...buildHeadingDecorations(view.state, view),
        ...buildBlockquoteDecorations(view.state, view),
        ...buildHorizontalRuleDecorations(view.state, view),
        ...buildCodeBlockDecorations(view.state, view),
        ...buildListDecorations(view.state, view),
        ...buildTaskDecorations(view.state, view),
        ...buildLinkDecorations(view.state, view),
        ...buildImageDecorations(view.state, view),
      ].sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide);
      for (const r of allRanges) {
        builder.add(r.from, r.to, r.value);
      }
      return builder.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(event: MouseEvent, view: EditorView) {
        if (!(event.ctrlKey || event.metaKey) || event.button !== 0)
          return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return false;
        let url: string | null = null;
        syntaxTree(view.state).iterate({
          from: pos,
          to: pos,
          enter(node) {
            if (node.name === "URL") {
              url = view.state.sliceDoc(node.from, node.to);
            }
          },
        });
        if (!url) return false;
        window.open(url, "_blank", "noopener noreferrer");
        event.preventDefault();
        return true;
      },
      // IME 変換確定後にデコレーションを強制再構築する。
      // !composing ガードにより変換中は更新をスキップするが、
      // compositionend 時点で update イベントが来ない場合があるため明示的に再描画する。
      compositionend(_event: CompositionEvent, view: EditorView) {
        this.decorations = this.build(view);
        return false;
      },
    },
  }
);

export function livePreview() {
  return [livePreviewPlugin, livePreviewBaseTheme];
}
