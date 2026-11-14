/**
 * フロントマターの表示と、通常の Markdown に影響しないことを検証する。
 */
import { render } from "@testing-library/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { describe, expect, it } from "vitest";
import { remarkMetadata } from "./remark-frontmatter";

const REMARK_PLUGINS = [remarkGfm, remarkMetadata];

describe("remarkMetadata", () => {
  it("preserves raw YAML line breaks and escapes markup without interpreting it", () => {
    const yaml = 'title: "<img src=x onerror=alert(1)>"\nsummary: |\n  **raw**\n  second line\npublished: false';
    const { container, getByTestId } = render(
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
        {`---\n${yaml}\n---\n\nBody **text**`}
      </ReactMarkdown>
    );

    expect(getByTestId("markdown-frontmatter").querySelector("pre")?.textContent).toBe(yaml);
    expect(container.querySelector("h1, h2, hr, img")).toBeNull();
    expect(container.querySelector("p")?.textContent).toBe("Body text");
    expect(container.querySelector("strong")?.textContent).toBe("text");
  });

  it("keeps a thematic break in the body after frontmatter", () => {
    const { container, getByTestId } = render(
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>
        {"---\ntitle: Draft\n---\n\nBefore\n\n---\n\nAfter"}
      </ReactMarkdown>
    );

    expect(getByTestId("markdown-frontmatter")).toBeInTheDocument();
    expect(container.querySelectorAll("hr")).toHaveLength(1);
    expect(Array.from(container.querySelectorAll("p"), (node) => node.textContent)).toEqual(["Before", "After"]);
  });

  it.each([
    "# Title\n\nBody **text**\n\n- [ ] todo",
    "Intro\n\n---\ntitle: Body\n---",
    "\n---\ntitle: After a blank line\n---",
    "---\ntitle: Unclosed",
    "+++\ntitle = 'TOML'\n+++",
    "```yaml\n---\ntitle: Code\n---\n```",
  ])("leaves Markdown without leading YAML unchanged: %s", (content) => {
    const { container, rerender } = render(
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    );
    const originalHtml = container.innerHTML;

    rerender(<ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>);

    expect(container.innerHTML).toBe(originalHtml);
    expect(container.querySelector(".markdown-frontmatter")).toBeNull();
  });
});
