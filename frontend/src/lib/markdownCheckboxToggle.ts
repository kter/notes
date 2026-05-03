/**
 * Markdown テキスト内の指定行にあるチェックボックスを on/off トグルして返す。
 * 箇条書き（- 、* 、+）と番号付きリスト（1.）の両形式、および大文字 [X] に対応する。
 * チェックボックスが存在しない行は変更せずそのまま返す。
 */
export function toggleMarkdownCheckbox(content: string, lineNumber: number): string {
  const lines = content.split("\n");
  const idx = lineNumber - 1; // lineNumber は 1 始まりなので 0 始まりインデックスに変換する
  if (idx < 0 || idx >= lines.length) return content;
  const line = lines[idx];
  let newLine: string | undefined;
  if (/^(\s*[-*+]\s+)\[x\]/i.test(line))       newLine = line.replace(/^(\s*[-*+]\s+)\[x\]/i, "$1[ ]");
  else if (/^(\s*[-*+]\s+)\[ \]/.test(line))    newLine = line.replace(/^(\s*[-*+]\s+)\[ \]/, "$1[x]");
  else if (/^(\s*\d+\.\s+)\[x\]/i.test(line))  newLine = line.replace(/^(\s*\d+\.\s+)\[x\]/i, "$1[ ]");
  else if (/^(\s*\d+\.\s+)\[ \]/.test(line))   newLine = line.replace(/^(\s*\d+\.\s+)\[ \]/, "$1[x]");
  if (newLine === undefined) return content;
  lines[idx] = newLine;
  return lines.join("\n");
}
