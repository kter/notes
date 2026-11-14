/**
 * 文書先頭の YAML フロントマターをメタ情報ブロックとして表示する remark プラグイン。
 * 元の位置情報を保ち、YAML の内容を解釈せずそのまま表示する。
 *
 * 主なエクスポート:
 * - remarkMetadata: エディタ・印刷・共有ページで共通利用するプラグイン
 */
import remarkFrontmatter from "remark-frontmatter";
import type { Root } from "mdast";
import type { Plugin } from "unified";

export const remarkMetadata: Plugin<[], Root> = function () {
  this.use(remarkFrontmatter, ["yaml"]);

  return (tree) => {
    const node = tree.children[0];
    if (node?.type !== "yaml") return;

    // yaml ノードは HTML 変換時に破棄されるため、表示用のノードに置き換える。
    tree.children[0] = {
      type: "paragraph",
      children: [],
      position: node.position,
      data: {
        ...node.data,
        hName: "div",
        hProperties: {
          className: ["markdown-frontmatter"],
          "data-testid": "markdown-frontmatter",
        },
        hChildren: [{
          type: "element",
          tagName: "pre",
          properties: {},
          children: [{ type: "text", value: node.value }],
        }],
      },
    };
  };
};
