export function toggleMarkdownCheckbox(content: string, lineNumber: number): string {
  const lines = content.split("\n");
  const idx = lineNumber - 1; // 1-indexed
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
