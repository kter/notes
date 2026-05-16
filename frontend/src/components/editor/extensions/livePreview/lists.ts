/**
 * Markdown 箇条書き（BulletList）および番号付きリスト（OrderedList）に対して
 * CM6 デコレーションを生成する。
 *
 * BulletList: カーソルが ListMark と同じ行にない場合、ListMark を BulletWidget（•）で置換する。
 * OrderedList: カーソルが同じ行にない場合は OrderedListMarkWidget でウィジェット置換する。
 *              ウィジェットはシンタックスハイライトの影響を受けないため通常テキスト色で表示される。
 *              カーソルが同じ行にある場合は cm-md-marker クラスを付与する。
 *
 * タスクリストマーカー（TaskMarker）はここでは扱わない。taskList.ts が担当する。
 *
 * 主なエクスポート:
 * - buildListDecorations: EditorState と EditorView から Range<Decoration>[] を返す
 *
 * 呼び出し関係: index.ts の ViewPlugin.build() から呼び出される。
 */
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { Range, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { isCursorOnLine } from "./cursorRange";

/**
 * 箇条書きマーカー（-、*、+）を • (U+2022) に置き換えるウィジェット。
 */
class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-bullet";
    span.textContent = "•";
    return span;
  }

  eq(other: BulletWidget): boolean {
    return other instanceof BulletWidget;
  }

  get estimatedHeight(): number {
    return -1;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 番号付きリストマーカー（1.、2. など）をウィジェットで置換するクラス。
 * ウィジェットとして描画することでシンタックスハイライトの色の影響を受けず、
 * 通常テキスト色で表示される。
 */
class OrderedListMarkWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-ol-mark";
    span.textContent = this.text;
    return span;
  }

  eq(other: OrderedListMarkWidget): boolean {
    return other instanceof OrderedListMarkWidget && other.text === this.text;
  }

  get estimatedHeight(): number {
    return -1;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/**
 * 可視範囲内の BulletList / OrderedList ノードを走査し、
 * ListMark に対してデコレーションを返す。
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
        // BulletList: ListItem の ListMark を bullet ウィジェットで置換
        if (node.name === "BulletList") {
          let item = node.node.firstChild;
          while (item) {
            if (item.name === "ListItem") {
              let child = item.firstChild;
              while (child) {
                if (child.name === "ListMark") {
                  if (!isCursorOnLine(state, child.from)) {
                    // カーソルが同じ行にない場合のみ bullet ウィジェットで置換
                    decorations.push(
                      Decoration.replace({
                        widget: new BulletWidget(),
                      }).range(child.from, child.to)
                    );
                  } else {
                    // カーソルが同じ行にある場合はマーカー色で表示
                    decorations.push(
                      Decoration.mark({ class: "cm-md-marker" }).range(child.from, child.to)
                    );
                  }
                  break;
                }
                child = child.nextSibling;
              }
            }
            item = item.nextSibling;
          }
          return false; // 子ノードの重複走査を避ける
        }

        // OrderedList: カーソルが同じ行にない場合はウィジェット置換、ある場合はマーカー色で表示
        if (node.name === "OrderedList") {
          let item = node.node.firstChild;
          while (item) {
            if (item.name === "ListItem") {
              let child = item.firstChild;
              while (child) {
                if (child.name === "ListMark") {
                  if (!isCursorOnLine(state, child.from)) {
                    // ウィジェット置換でシンタックスハイライトの影響を受けずに通常色で表示
                    const markText = state.sliceDoc(child.from, child.to);
                    decorations.push(
                      Decoration.replace({
                        widget: new OrderedListMarkWidget(markText),
                      }).range(child.from, child.to)
                    );
                  } else {
                    // カーソルが同じ行にある場合はマーカー色で表示
                    decorations.push(
                      Decoration.mark({ class: "cm-md-marker" }).range(child.from, child.to)
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
