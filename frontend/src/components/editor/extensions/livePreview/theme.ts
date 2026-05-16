/**
 * ライブプレビュー拡張で使用するベーステーマを定義する。
 * インライン装飾（太字・斜体・取り消し線・コード）の CSS クラスと
 * マーカーを薄く表示するためのクラスを含む。
 *
 * 主なエクスポート:
 * - livePreviewBaseTheme: CM6 EditorView.baseTheme として登録するスタイル定義
 *
 * 呼び出し関係: index.ts から livePreview() 拡張配列に組み込まれる。
 */
import { EditorView } from "@codemirror/view";

export const livePreviewBaseTheme = EditorView.baseTheme({
  ".cm-md-strong": {
    fontWeight: "bold",
  },
  ".cm-md-em": {
    fontStyle: "italic",
  },
  ".cm-md-strikethrough": {
    textDecoration: "line-through",
  },
  ".cm-md-code": {
    fontFamily: "monospace",
    background: "var(--muted, rgba(0,0,0,0.08))",
    borderRadius: "3px",
    padding: "0 3px",
  },
  // カーソルが同一行にある場合: マーカーを色付きで表示する
  ".cm-md-marker": {
    color: "var(--muted-foreground, #6b7280)",
  },

  // 見出し (ATX: #〜######)
  ".cm-md-h1": { fontSize: "2em", fontWeight: "bold", lineHeight: "1.2" },
  ".cm-md-h2": { fontSize: "1.5em", fontWeight: "bold", lineHeight: "1.3" },
  ".cm-md-h3": { fontSize: "1.25em", fontWeight: "bold" },
  ".cm-md-h4": { fontSize: "1.1em", fontWeight: "bold" },
  ".cm-md-h5": { fontSize: "1em", fontWeight: "bold" },
  ".cm-md-h6": { fontSize: "0.9em", fontWeight: "bold", opacity: "0.8" },

  // Setext 見出しのアンダーライン行（=== / ---）はカーソルが離れたら非表示
  ".cm-md-h1-underline": { display: "none" },
  ".cm-md-h2-underline": { display: "none" },

  // ブロッククォート
  ".cm-md-blockquote": {
    borderLeft: "3px solid var(--muted-foreground, #888)",
    paddingLeft: "0.75em",
    opacity: "0.85",
  },

  // フェンスコードブロック
  ".cm-md-fenced": {
    fontFamily: "monospace",
    background: "rgba(0,0,0,0.05)",
  },

  // 水平線ライン（カーソルが離れている行に付与）
  ".cm-md-hr-line": {
    position: "relative",
    minHeight: "1em",
  },
  // CSS ::after で水平線を描画（--- テキストは Decoration.replace で非表示）
  ".cm-md-hr-line::after": {
    content: '""',
    display: "block",
    borderTop: "1px solid var(--muted-foreground, #888)",
    opacity: "0.6",
    position: "absolute",
    left: "0",
    right: "0",
    top: "50%",
    pointerEvents: "none",
  },

  // 箇条書きマーカー置換ウィジェット
  ".cm-md-bullet": {
    display: "inline-block",
    width: "1em",
    color: "var(--muted-foreground, #6b7280)",
  },

  // 番号付きリストマーカー
  ".cm-md-ol-mark": {
    color: "var(--muted-foreground, #6b7280)",
  },

  // タスクリストチェックボックス
  ".cm-md-task-checkbox": {
    cursor: "pointer",
    marginRight: "0.4em",
    verticalAlign: "middle",
  },

  // リンク
  ".cm-md-link": {
    color: "#2563eb",
    textDecoration: "underline",
    cursor: "pointer",
  },

  // 画像ウィジェット
  ".cm-md-image": {
    maxWidth: "100%",
    display: "block",
    margin: "0.25em 0",
    borderRadius: "4px",
  },
});
