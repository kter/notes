import { visit } from 'unist-util-visit';
import type { Node } from 'unist';

/**
 * Remark plugin to add data-source-line attribute to AST nodes
 * based on their source position.
 */
export function remarkSourceLine() {
  return (tree: Node) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    visit(tree, (node: any) => {
      // Only add to nodes that look like they could be block elements or relevant
      // We skip 'root'
      if (node.type === 'root') return;

      if (node.position?.start?.line) {
        node.data = node.data || {};
        node.data.hProperties = node.data.hProperties || {};
        // Inject the starting line number
        node.data.hProperties['data-source-line'] = node.position.start.line;
      }
    });
  };
}
