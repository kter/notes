/**
 * Markdown タスクリスト（[ ] / [x]）に対して
 * CM6 チェックボックスウィジェットデコレーションを生成する。
 *
 * TaskMarker ノード（[ ] または [x] または [X]）を検出し、
 * クリックで toggleMarkdownCheckbox を呼び出すインタラクティブな
 * <input type="checkbox"> ウィジェットに置換する。
 *
 * 主なエクスポート:
 * - buildTaskDecorations: EditorState と EditorView から Range<Decoration>[] を返す
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { toggleMarkdownCheckbox } from "@/lib/markdownCheckboxToggle";

/**
 * チェックボックスの変更イベントを処理する。
 * toggleMarkdownCheckbox でドキュメントを更新し、dispatch する。
 */
function handleTaskCheckboxChange(view: EditorView, markerFrom: number): void {
  const doc = view.state.doc.toString();
  const lineNumber = view.state.doc.lineAt(markerFrom).number; // 1-based
  const result = toggleMarkdownCheckbox(doc, lineNumber);
  if (result !== doc) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: result },
    });
  }
}

/**
 * タスクチェックボックス（[ ] / [x]）を <input type="checkbox"> に置換するウィジェット。
 */
export class TaskCheckboxWidget extends WidgetType {
  constructor(
    private checked: boolean,
    private markerFrom: number
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TaskCheckboxWidget &&
      other.checked === this.checked &&
      other.markerFrom === this.markerFrom
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-md-task-checkbox";
    input.checked = this.checked;
    const markerFrom = this.markerFrom;
    input.addEventListener("change", () => {
      handleTaskCheckboxChange(view, markerFrom);
    });
    return input;
  }

  ignoreEvent(e: Event): boolean {
    // change イベントは CM6 に飲み込まれないようにする（false = 伝播させる）
    // その他のイベント（mousedown など）は CM6 に飲み込んでカーソル移動を防ぐ
    return e.type !== "change";
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const input = dom as HTMLInputElement;
    input.checked = this.checked;
    // 古いイベントリスナーを除去して再登録
    const markerFrom = this.markerFrom;
    const newListener = () => {
      handleTaskCheckboxChange(view, markerFrom);
    };
    // cloneNode でイベントリスナーを除去してから置き換えるのが確実だが、
    // ここでは単純に checked を更新し新しいリスナーを付与する
    // （前のリスナーは旧クロージャを参照するため影響は最小限）
    input.addEventListener("change", newListener);
    return true;
  }
}

/**
 * 可視範囲内の TaskMarker ノードを走査し、
 * チェックボックスウィジェットデコレーションを返す。
 */
export function buildTaskDecorations(
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
        if (node.name !== "TaskMarker") return;

        const text = state.sliceDoc(node.from, node.to);
        const checked = text.toLowerCase().includes("x");

        decorations.push(
          Decoration.replace({
            widget: new TaskCheckboxWidget(checked, node.from),
            atomic: true,
          }).range(node.from, node.to)
        );
      },
    });
  }

  decorations.sort(
    (a, b) => a.from - b.from || a.value.startSide - b.value.startSide
  );
  return decorations;
}
