/**
 * EditorMarkdownPreview のユニットテスト。
 * remarkGfm を含むプラグイン構成で、代表的な Markdown / GFM 構文が
 * 正しい HTML 要素としてレンダリングされることを検証する。
 */
import { describe, it, expect } from "vitest";
import { createRef } from "react";
import { render } from "@testing-library/react";
import { EditorMarkdownPreview } from "./EditorMarkdownPreview";

function renderPreview(content: string) {
  return render(
    <EditorMarkdownPreview
      deferredContent={content}
      markdownComponents={{}}
      previewContainerRef={createRef<HTMLDivElement>()}
      onPreviewScroll={undefined}
      isDesktopViewport={true}
      previewPlaceholder="Nothing to preview"
    />
  );
}

describe("EditorMarkdownPreview — markdown rendering", () => {
  it("renders headings as h1-h3 elements", () => {
    const { container } = renderPreview("# Title\n\n## Section\n\n### Sub");
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("h2")?.textContent).toBe("Section");
    expect(container.querySelector("h3")?.textContent).toBe("Sub");
  });

  it("renders bold, italic and inline code", () => {
    const { container } = renderPreview("**bold** *italic* `code`");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("italic");
    expect(container.querySelector("code")?.textContent).toBe("code");
  });

  it("renders unordered and ordered lists", () => {
    const { container } = renderPreview("- one\n- two\n\n1. first\n2. second");
    const ulItems = container.querySelectorAll("ul > li");
    const olItems = container.querySelectorAll("ol > li");
    expect(ulItems.length).toBe(2);
    expect(olItems.length).toBe(2);
    expect(olItems[1].textContent).toBe("second");
  });

  it("renders a fenced code block as pre > code", () => {
    const { container } = renderPreview("```js\nconst a = 1;\n```");
    const code = container.querySelector("pre > code");
    expect(code).toBeTruthy();
    expect(code?.textContent).toContain("const a = 1;");
  });

  it("renders blockquote and horizontal rule", () => {
    const { container } = renderPreview("> quoted\n\n---");
    expect(container.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(container.querySelector("hr")).toBeTruthy();
  });

  it("renders links with href and images with src/alt", () => {
    const { container } = renderPreview(
      "[site](https://example.com)\n\n![logo](https://example.com/a.png)"
    );
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.textContent).toBe("site");
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://example.com/a.png");
    expect(img?.getAttribute("alt")).toBe("logo");
  });

  it("renders a GFM table with header and body cells", () => {
    const { container } = renderPreview(
      "| Name | Qty |\n| --- | --- |\n| pen | 3 |\n| book | 7 |"
    );
    const table = container.querySelector("table");
    expect(table).toBeTruthy();
    const headers = container.querySelectorAll("th");
    expect(headers.length).toBe(2);
    expect(headers[0].textContent).toBe("Name");
    const cells = container.querySelectorAll("td");
    expect(cells.length).toBe(4);
    expect(cells[3].textContent).toBe("7");
  });

  it("renders GFM strikethrough as a del element", () => {
    const { container } = renderPreview("~~obsolete~~ current");
    expect(container.querySelector("del")?.textContent).toBe("obsolete");
  });

  it("renders GFM task list items as checkboxes with correct checked state", () => {
    const { container } = renderPreview("- [ ] todo\n- [x] done");
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(false);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
  });

  it("renders GFM autolink as an anchor", () => {
    const { container } = renderPreview("visit https://example.com now");
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.com");
  });

  it("annotates task list lines with data-source-line for checkbox toggling", () => {
    // remarkSourceLine が data-source-line を注入する — EditorPanel の
    // checkbox onChange はこの属性で対象行を特定するため、欠落すると壊れる
    const { container } = renderPreview("intro\n\n- [ ] todo on line 3");
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    const annotated = checkbox?.closest("[data-source-line]");
    expect(annotated?.getAttribute("data-source-line")).toBe("3");
  });

  it("renders the placeholder in italics when content is empty", () => {
    const { container } = renderPreview("");
    expect(container.querySelector("em")?.textContent).toBe("Nothing to preview");
  });
});
