"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkSourceLine } from "@/lib/remark-source-line";
import { cn } from "@/lib/utils";

const REMARK_PLUGINS = [remarkGfm, remarkSourceLine];

interface EditorMarkdownPreviewProps {
  deferredContent: string;
  markdownComponents: Components;
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  onPreviewScroll: (() => void) | undefined;
  isDesktopViewport: boolean;
  previewPlaceholder: string;
}

export const EditorMarkdownPreview = memo(function EditorMarkdownPreview({
  deferredContent,
  markdownComponents,
  previewContainerRef,
  onPreviewScroll,
  isDesktopViewport,
  previewPlaceholder,
}: EditorMarkdownPreviewProps) {
  return (
    <div
      className={cn("min-w-0 overflow-y-auto", isDesktopViewport ? "flex-1" : "w-full")}
      ref={previewContainerRef}
      onScroll={onPreviewScroll}
      data-testid="editor-preview-pane"
    >
      <div className="markdown-preview prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
          {deferredContent || `*${previewPlaceholder}*`}
        </ReactMarkdown>
      </div>
    </div>
  );
});
