import { visit } from 'unist-util-visit';
import type { Node } from 'unist';

/**
 * Markdown AST の各ノードに data-source-line 属性を付与する remark プラグイン。
 * チェックボックスクリック時などに対応する Markdown 行番号を特定するために使用する。
 *
 * 主なエクスポート:
 * - remarkSourceLine: remark プラグイン関数
 *
 * 呼び出し関係: Markdown レンダラーの unified/remark パイプラインから使用される。
 */
export function remarkSourceLine() {
  return (tree: Node) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, (node: any) => {
      // root ノードはスキップし、それ以外の全ノードを対象にする
      if (node.type === 'root') return;

      if (node.position?.start?.line) {
        node.data = node.data || {};
        node.data.hProperties = node.data.hProperties || {};
        // ノードの開始行番号を HTML 属性として埋め込む
        node.data.hProperties['data-source-line'] = node.position.start.line;
      }
    });
  };
}
