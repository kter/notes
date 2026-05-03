/**
 * ネストされたリスト項目にインデントガイドライン（縦線）を表示する CM6 ViewPlugin 拡張。
 * カーソルがリストマーカープレフィックス内にある場合のみ表示し、それ以外では非表示にする。
 *
 * 主なエクスポート:
 * - indentGuide: CM6 拡張として MarkdownEditor の extensions 配列に渡す ViewPlugin
 *
 * 呼び出し関係: MarkdownEditor.tsx の extensions 配列で使用される。
 */
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

const INDENT_SPACES = 2;
// Matches: optional leading spaces, optional list marker, optional space after marker
const LIST_PREFIX_RE = /^(\s*)([-*+]|\d+\.)(\s*)/;

/**
 * インデントガイドラインを DOM に直接描画するプラグインクラス。
 * EditorView の DOM 上に absolute オーバーレイを追加し、インデントレベルに応じた縦線を動的に生成・管理する。
 */
class IndentGuidePlugin {
  overlay: HTMLDivElement;
  guideLines: HTMLDivElement[] = [];

  constructor(view: EditorView) {
    this.overlay = document.createElement("div");
    this.overlay.className = "absolute inset-0 pointer-events-none overflow-hidden";
    this.overlay.setAttribute("data-testid", "indent-guide-overlay");
    this.overlay.setAttribute("aria-hidden", "true");
    this.overlay.style.display = "none";
    view.dom.appendChild(this.overlay);
    this.render(view);
  }

  update(update: ViewUpdate) {
    if (update.selectionSet || update.docChanged) {
      this.render(update.view);
    }
  }

  render(view: EditorView) {
    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const text = line.text;

    // Only show when the cursor is at or within the list marker prefix of an indented line
    const m = text.match(LIST_PREFIX_RE);
    if (!m) {
      this.hide();
      return;
    }

    const indentLen = m[1].length;
    const level = Math.floor(indentLen / INDENT_SPACES);
    if (level === 0) {
      this.hide();
      return;
    }

    const prefixLen = m[1].length + m[2].length + m[3].length;
    const cursorOffsetInLine = cursor - line.from;
    if (cursorOffsetInLine > prefixLen) {
      this.hide();
      return;
    }

    this.overlay.style.display = "";
    this.syncLines(level);
  }

  hide() {
    this.overlay.style.display = "none";
    this.syncLines(0);
  }

  /**
   * 表示すべきガイドライン数に合わせて DOM 要素を増減させる。
   * 不足分は新規追加、余分は DOM から削除して配列も縮小する。
   */
  syncLines(count: number) {
    while (this.guideLines.length < count) {
      const idx = this.guideLines.length;
      const div = document.createElement("div");
      div.className = "absolute top-0 bottom-0 w-px bg-gray-400/40 dark:bg-gray-500/40";
      div.setAttribute("data-testid", `indent-guide-line-${idx}`);
      div.style.left = `${(idx + 1) * INDENT_SPACES}ch`;
      this.overlay.appendChild(div);
      this.guideLines.push(div);
    }
    while (this.guideLines.length > count) {
      const div = this.guideLines.pop();
      div?.remove();
    }
  }

  destroy() {
    this.overlay.remove();
  }
}

export const indentGuide = ViewPlugin.fromClass(IndentGuidePlugin);
