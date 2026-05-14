/**
 * カーソルと文書内の範囲・行との関係を判定するユーティリティ関数群。
 * ライブプレビュー拡張でマーカーの表示・非表示を切り替える際に使用する。
 *
 * 主なエクスポート:
 * - isCursorInRange: 選択範囲が指定した [from, to] と重なるか判定
 * - isCursorOnLine: 選択範囲が指定した位置と同じ行にあるか判定
 *
 * 呼び出し関係: inlineStyles.ts から使用される。
 */
import { EditorState } from "@codemirror/state";

/**
 * 選択範囲のいずれかが [from, to] と重なる場合に true を返す。
 * 重なりの判定: 選択の from が to 未満、かつ選択の to が from より大きい。
 */
export function isCursorInRange(
  state: EditorState,
  from: number,
  to: number
): boolean {
  for (const range of state.selection.ranges) {
    if (range.from < to && range.to > from) {
      return true;
    }
  }
  return false;
}

/**
 * 選択範囲のいずれかが pos と同じ行にある場合に true を返す。
 */
export function isCursorOnLine(state: EditorState, pos: number): boolean {
  const targetLine = state.doc.lineAt(pos);
  for (const range of state.selection.ranges) {
    const selLine = state.doc.lineAt(range.from);
    if (selLine.number === targetLine.number) {
      return true;
    }
  }
  return false;
}
