/**
 * Markdown コンテンツをリアルタイムでプレビュー表示するコンポーネント。
 * GFM 拡張・フロントマター表示・チェックボックスのソース行追跡プラグインを適用する。
 * deferredContent を受け取ることで、エディタの入力と描画コストを分離しタイピングの遅延を防ぐ。
 *
 * 主なエクスポート:
 * - EditorMarkdownPreview: Markdown プレビューペインコンポーネント
 *
 * 呼び出し関係: EditorPanel から使用される。
 */
"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkMetadata } from "@/lib/remark-frontmatter";
import { remarkSourceLine } from "@/lib/remark-source-line";
import { cn } from "@/lib/utils";

// プラグイン配列を毎レンダーで再生成しないよう定数として外部に定義する
const REMARK_PLUGINS = [remarkGfm, remarkMetadata, remarkSourceLine];

interface EditorMarkdownPreviewProps {
  deferredContent: string;
  markdownComponents: Components;
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  onPreviewScroll: (() => void) | undefined;
  isDesktopViewport: boolean;
  previewPlaceholder: string;
}

/**
 * Markdown プレビューペイン本体。
 * デスクトップでは flex-1 で残余領域を占有し、モバイルでは w-full で全幅表示する。
 * previewContainerRef / onPreviewScroll はエディタとの双方向スクロール同期に使用される。
 */
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
