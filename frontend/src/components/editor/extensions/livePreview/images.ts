/**
 * Markdown 画像（![alt](url)）に対して CM6 インライン画像ウィジェットデコレーションを生成する。
 * カーソルが画像と同じ行にない場合、画像構文全体を <img> ウィジェットで置換する。
 * カーソルが同じ行にある場合は生のマークダウンを表示する。
 *
 * 主なエクスポート:
 * - buildImageDecorations: EditorState と EditorView から Range<Decoration>[] を返す
 * - ImageWidget: テストで型チェックするためエクスポート
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isCursorOnLine } from "./cursorRange";

/**
 * Markdown 画像構文を <img> 要素にレンダリングするウィジェット。
 */
export class ImageWidget extends WidgetType {
  constructor(
    private url: string,
    private alt: string
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageWidget &&
      other.url === this.url &&
      other.alt === this.alt
    );
  }

  toDOM(): HTMLElement {
    const img = document.createElement("img");
    img.className = "cm-md-image";
    img.src = this.url;
    img.alt = this.alt;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.style.maxWidth = "100%";
    img.style.display = "block";
    img.style.margin = "0.25em 0";
    return img;
  }

  ignoreEvent(): boolean {
    return true;
  }

  get estimatedHeight(): number {
    return -1;
  }
}

/**
 * 可視範囲内の Image ノードを走査し、
 * カーソルが離れている場合に ImageWidget デコレーションを返す。
 */
export function buildImageDecorations(
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
        if (node.name !== "Image") return;

        const { from: nFrom, to: nTo } = node;

        // カーソルが画像と同じ行にある場合は生のマークダウンを表示
        if (isCursorOnLine(state, nFrom)) return;

        // URL と alt テキストを子ノードから取得する。
        // lezer は ![alt](url) を LinkMark("![") LinkMark("]") LinkMark("(") URL LinkMark(")")
        // という構造でパースする。alt テキストは最初の LinkMark の直後〜2番目の LinkMark の直前。
        let urlText = "";
        let altText = "";

        const linkMarks: Array<{ from: number; to: number }> = [];
        let child = node.node.firstChild;
        while (child) {
          if (child.name === "URL") {
            urlText = state.sliceDoc(child.from, child.to);
          } else if (child.name === "LinkLabel") {
            // LinkLabel には [ と ] が含まれる場合があるため除去する
            const raw = state.sliceDoc(child.from, child.to);
            altText = raw.replace(/^\[/, "").replace(/\]$/, "");
          } else if (child.name === "LinkMark") {
            linkMarks.push({ from: child.from, to: child.to });
          }
          child = child.nextSibling;
        }

        // LinkLabel が見つからない場合、最初の LinkMark の直後〜2番目の LinkMark の直前から alt を取得
        if (altText === "" && linkMarks.length >= 2) {
          const firstMark = linkMarks[0];
          const secondMark = linkMarks[1];
          altText = state.sliceDoc(firstMark.to, secondMark.from);
        }

        decorations.push(
          Decoration.replace({
            widget: new ImageWidget(urlText, altText),
            atomic: true,
            block: false,
          }).range(nFrom, nTo)
        );

        return false; // 子ノードの重複走査を避ける
      },
    });
  }

  decorations.sort(
    (a, b) => a.from - b.from || a.value.startSide - b.value.startSide
  );
  return decorations;
}
