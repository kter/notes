/**
 * ノート編集エリア全体を管理するパネルコンポーネント。
 * タイトル入力・Markdown エディタ・AI Edit diff 表示・
 * 画像アップロード・自動保存・印刷・フルスクリーンなどの機能を統括する。
 *
 * 主なエクスポート:
 * - EditorPanel: エディタパネルコンポーネント
 *
 * 呼び出し関係: AuthenticatedWorkspace から ThreeColumnLayout の editor スロットで使用される。
 */
"use client";

import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { Note, Folder, TokenUsageRead, EditProposal } from "@/types";
import { DiffView } from "@/components/ai/DiffView";
import { useApi, useTranslation } from "@/hooks";
import { useEffect, useState, useRef, useCallback, useMemo, useDeferredValue, startTransition, type KeyboardEvent } from "react";
import { MarkdownEditor, type MarkdownEditorHandle } from "@/components/editor/MarkdownEditor";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toggleMarkdownCheckbox } from "@/lib/markdownCheckboxToggle";
import type { SyncStatus } from "@/hooks/useNotes";
import { calculateHash, cn } from "@/lib/utils";
import { createPortal, flushSync } from "react-dom";
import { EditorToolbar } from "./EditorToolbar";
import { EditorMarkdownPreview } from "./EditorMarkdownPreview";
import { EditorStatusBar } from "./EditorStatusBar";
import { useEditorDisplayMode } from "@/hooks/useEditorDisplayMode";

/** 文字列をファイルとしてダウンロードさせるユーティリティ関数。Blob URL を一時生成して即解放する。 */
function downloadFile(fileContent: string, filename: string, mimeType: string) {
  const blob = new Blob([fileContent], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const DESKTOP_BREAKPOINT = 1024;
const DEFAULT_EDITOR_PREVIEW_WIDTH = 50;
const MIN_PREVIEW_WIDTH_PX = 200;
const PREVIEW_RESIZE_HANDLE_WIDTH_PX = 8;
const EDITOR_PREVIEW_WIDTH_STORAGE_KEY = "notes-editor-preview-width";
const EDITOR_PREVIEW_LAST_WIDTH_STORAGE_KEY = "notes-editor-preview-last-width";
const PRINT_MODE_BODY_CLASS = "printing-note-preview";

interface EditorPanelProps {
  note: Note | null;
  folders: Folder[];
  onUpdateNote: (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => void;
  onDeleteNote: (id: string) => void;
  onSummarize: (id: string) => void;
  onOpenChat: () => void;
  isChatOpen: boolean;
  isSummarizing?: boolean;
  syncStatus: SyncStatus;
  triggerServerSync?: (id: string) => void;
  savedHash?: string;
  tokenUsage?: TokenUsageRead | null;
  onContentChange?: (content: string) => void;
  onSelectionChange?: (selectedText: string) => void;
  contentOverride?: { noteId: string; content: string; version: number } | null;
  pendingEditProposal?: EditProposal | null;
  onAcceptEdit?: () => void;
  onRejectEdit?: () => void;
}

/**
 * エディタパネル本体。
 * note が null の場合は「ノートを選択してください」プレースホルダーを表示する。
 * key={note.id} で note 切り替え時に全 state をリセットするため、親側でのマウントに依存する。
 */
export function EditorPanel({
  note,
  folders,
  onUpdateNote,
  onDeleteNote,
  onSummarize,
  onOpenChat,
  isChatOpen,
  isSummarizing = false,
  syncStatus,
  onContentChange,
  onSelectionChange,
  contentOverride,
  triggerServerSync,
  savedHash,
  tokenUsage,
  pendingEditProposal,
  onAcceptEdit,
  onRejectEdit,
}: EditorPanelProps) {
  const { getApi } = useApi();
  const { t } = useTranslation();
  const { mode: editorDisplayMode, setMode: setEditorDisplayMode } = useEditorDisplayMode();
  const handleToggleEditorDisplayMode = useCallback(() => {
    setEditorDisplayMode(editorDisplayMode === "live-preview" ? "raw" : "live-preview");
  }, [editorDisplayMode, setEditorDisplayMode]);
  // Initialize state from props - reliance on key={note.id} in parent to reset state on switch
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [committedContent, setCommittedContent] = useState(note?.content ?? "");
  const deferredContent = useDeferredValue(committedContent);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    () => typeof window === "undefined" || window.innerWidth >= DESKTOP_BREAKPOINT
  );
  const [editorPreviewWidth, setEditorPreviewWidth] = useState(DEFAULT_EDITOR_PREVIEW_WIDTH);
  const [lastExpandedEditorPreviewWidth, setLastExpandedEditorPreviewWidth] = useState(DEFAULT_EDITOR_PREVIEW_WIDTH);
  const [isPreviewResizing, setIsPreviewResizing] = useState(false);
  const fullscreenContainerRef = useRef<HTMLDivElement>(null);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [printSnapshot, setPrintSnapshot] = useState<{ title: string; content: string } | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const editorPreviewLayoutRef = useRef<HTMLDivElement>(null);
  const editorPreviewWidthRef = useRef(editorPreviewWidth);
  const lastExpandedEditorPreviewWidthRef = useRef(lastExpandedEditorPreviewWidth);
  const printCleanupRef = useRef<(() => void) | null>(null);
  const isScrollingRef = useRef(false);
  const editorScrollRafRef = useRef<number | null>(null);
  const previewScrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    editorPreviewWidthRef.current = editorPreviewWidth;
  }, [editorPreviewWidth]);

  useEffect(() => {
    lastExpandedEditorPreviewWidthRef.current = lastExpandedEditorPreviewWidth;
  }, [lastExpandedEditorPreviewWidth]);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktopViewport(window.innerWidth >= DESKTOP_BREAKPOINT);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Hash-based Verification Logic
  const [currentHash, setCurrentHash] = useState("");

  // Calculate hash only when the browser is idle to avoid competing with typing
  useEffect(() => {
    let cancelled = false;
    const calculate = async () => {
      if (cancelled) return;
      const hash = await calculateHash(content);
      if (!cancelled) setCurrentHash(hash);
    };
    const scheduleId = typeof requestIdleCallback !== "undefined"
      ? requestIdleCallback(calculate, { timeout: 2000 })
      : setTimeout(calculate, 2000) as unknown as number;
    return () => {
      cancelled = true;
      if (typeof requestIdleCallback !== "undefined") cancelIdleCallback(scheduleId);
      else clearTimeout(scheduleId as unknown as ReturnType<typeof setTimeout>);
    };
  }, [content]);

  // Refs to track the last saved state to avoid loops with optimistic updates
  const lastSavedTitle = useRef(note?.title ?? "");
  const lastSavedContent = useRef(note?.content ?? "");

  // Refs to track current state for immediate access in callbacks
  const currentTitleRef = useRef(title);
  const currentContentRef = useRef(content);

  // Update refs on mount (key={note.id} remounts on note switch).
  // lastSaved refs track the persisted baseline; current refs track the live editor state.
  // Use the initialized `content` state (which prefers noteBodyStore over note?.content)
  // so that prior unsaved edits aren't clobbered by the stale prop value.
  useEffect(() => {
    lastSavedTitle.current = note?.title ?? "";
    lastSavedContent.current = note?.content ?? "";
    currentTitleRef.current = note?.title ?? "";
    currentContentRef.current = content;
    onContentChange?.(content);
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply content override from AI edit accept — only for the note it was created for
  const contentOverrideVersionRef = useRef<number>(-1);
  useEffect(() => {
    if (
      contentOverride &&
      contentOverride.noteId === note?.id &&
      contentOverride.version !== contentOverrideVersionRef.current
    ) {
      contentOverrideVersionRef.current = contentOverride.version;
      editorRef.current?.setValue(contentOverride.content);
    }
  }, [contentOverride, note?.id]);

  // Trigger server sync on unmount or when switching notes
  // Store note.id in a ref so cleanup function has access to the current value
  const noteIdRef = useRef(note?.id);
  useEffect(() => {
    noteIdRef.current = note?.id;
  }, [note?.id]);

  // Clean up print mode on unmount
  useEffect(() => {
    return () => {
      printCleanupRef.current?.();
    };
  }, []);

  const clampEditorPreviewWidth = useCallback((nextWidth: number) => {
    const normalizedWidth = Math.max(0, Math.min(100, nextWidth));
    const layoutWidth = editorPreviewLayoutRef.current?.clientWidth;

    if (!layoutWidth || !isDesktopViewport) {
      return normalizedWidth;
    }

    const maxEditorWidthPx = Math.max(
      0,
      layoutWidth - MIN_PREVIEW_WIDTH_PX - PREVIEW_RESIZE_HANDLE_WIDTH_PX
    );

    if (maxEditorWidthPx <= 0) {
      return 0;
    }

    const maxEditorWidthPercent = (maxEditorWidthPx / layoutWidth) * 100;
    return Math.min(normalizedWidth, maxEditorWidthPercent);
  }, [isDesktopViewport]);

  const persistEditorPreviewWidths = useCallback((width: number, lastExpandedWidth: number) => {
    localStorage.setItem(EDITOR_PREVIEW_WIDTH_STORAGE_KEY, String(width));
    localStorage.setItem(EDITOR_PREVIEW_LAST_WIDTH_STORAGE_KEY, String(lastExpandedWidth));
  }, []);

  const applyEditorPreviewWidth = useCallback((nextWidth: number) => {
    const clampedWidth = clampEditorPreviewWidth(nextWidth);

    setEditorPreviewWidth(clampedWidth);
    editorPreviewWidthRef.current = clampedWidth;

    if (clampedWidth > 0) {
      setLastExpandedEditorPreviewWidth(clampedWidth);
      lastExpandedEditorPreviewWidthRef.current = clampedWidth;
    }

    return clampedWidth;
  }, [clampEditorPreviewWidth]);

  const handleHideEditorPane = useCallback(() => {
    const currentWidth = editorPreviewWidthRef.current;
    if (currentWidth > 0) {
      setLastExpandedEditorPreviewWidth(currentWidth);
      lastExpandedEditorPreviewWidthRef.current = currentWidth;
    }

    setEditorPreviewWidth(0);
    editorPreviewWidthRef.current = 0;
    persistEditorPreviewWidths(0, lastExpandedEditorPreviewWidthRef.current);
  }, [persistEditorPreviewWidths]);

  const handleShowEditorPane = useCallback(() => {
    const fallbackWidth = lastExpandedEditorPreviewWidthRef.current > 0
      ? lastExpandedEditorPreviewWidthRef.current
      : DEFAULT_EDITOR_PREVIEW_WIDTH;
    const restoredWidth = applyEditorPreviewWidth(fallbackWidth);
    const lastWidth = restoredWidth > 0 ? restoredWidth : fallbackWidth;
    persistEditorPreviewWidths(restoredWidth, lastWidth);
  }, [applyEditorPreviewWidth, persistEditorPreviewWidths]);

  const handlePreviewToggle = useCallback(() => {
    if (!isPreviewOpen && isDesktopViewport && editorPreviewWidthRef.current === 0) {
      handleShowEditorPane();
    }

    setIsPreviewOpen((previouslyOpen) => !previouslyOpen);
  }, [handleShowEditorPane, isDesktopViewport, isPreviewOpen]);

  const handlePreviewResizeStart = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDesktopViewport || !editorPreviewLayoutRef.current) {
      return;
    }

    e.preventDefault();
    setIsPreviewResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const startX = e.clientX;
    const initialLayoutWidth = editorPreviewLayoutRef.current.clientWidth;
    const startWidthPx = (editorPreviewWidthRef.current / 100) * initialLayoutWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const currentLayoutWidth = editorPreviewLayoutRef.current?.clientWidth ?? initialLayoutWidth;
      const delta = moveEvent.clientX - startX;
      const nextWidthPx = startWidthPx + delta;
      const nextWidthPercent = currentLayoutWidth > 0
        ? (nextWidthPx / currentLayoutWidth) * 100
        : 0;

      applyEditorPreviewWidth(nextWidthPercent);
    };

    const handleMouseUp = () => {
      setIsPreviewResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      persistEditorPreviewWidths(
        editorPreviewWidthRef.current,
        lastExpandedEditorPreviewWidthRef.current
      );
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [applyEditorPreviewWidth, isDesktopViewport, persistEditorPreviewWidths]);

  const handlePreviewResizeKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!isDesktopViewport || !isPreviewOpen) {
      return;
    }

    let nextWidth = editorPreviewWidthRef.current;

    if (e.key === "ArrowLeft") {
      nextWidth -= 5;
    } else if (e.key === "ArrowRight") {
      nextWidth += 5;
    } else if (e.key === "Home") {
      nextWidth = 0;
    } else if (e.key === "End") {
      nextWidth = 100;
    } else {
      return;
    }

    e.preventDefault();
    const appliedWidth = applyEditorPreviewWidth(nextWidth);
    persistEditorPreviewWidths(
      appliedWidth,
      appliedWidth > 0 ? appliedWidth : lastExpandedEditorPreviewWidthRef.current
    );
  }, [applyEditorPreviewWidth, isDesktopViewport, isPreviewOpen, persistEditorPreviewWidths]);

  const handlePreviewResizeDoubleClick = useCallback(() => {
    if (!isDesktopViewport || !isPreviewOpen) {
      return;
    }

    const restoredWidth = applyEditorPreviewWidth(DEFAULT_EDITOR_PREVIEW_WIDTH);
    const lastWidth = restoredWidth > 0 ? restoredWidth : DEFAULT_EDITOR_PREVIEW_WIDTH;
    persistEditorPreviewWidths(restoredWidth, lastWidth);
  }, [applyEditorPreviewWidth, isDesktopViewport, isPreviewOpen, persistEditorPreviewWidths]);

  useEffect(() => {
    const savedWidth = parseFloat(localStorage.getItem(EDITOR_PREVIEW_WIDTH_STORAGE_KEY) ?? "");
    const savedLastExpandedWidth = parseFloat(
      localStorage.getItem(EDITOR_PREVIEW_LAST_WIDTH_STORAGE_KEY) ?? ""
    );

    if (!Number.isNaN(savedWidth)) {
      setEditorPreviewWidth(Math.max(0, Math.min(100, savedWidth)));
      editorPreviewWidthRef.current = Math.max(0, Math.min(100, savedWidth));
    }

    if (!Number.isNaN(savedLastExpandedWidth) && savedLastExpandedWidth > 0) {
      setLastExpandedEditorPreviewWidth(Math.min(100, savedLastExpandedWidth));
      lastExpandedEditorPreviewWidthRef.current = Math.min(100, savedLastExpandedWidth);
    }
  }, []);

  useEffect(() => {
    if (!isPreviewOpen || !isDesktopViewport) {
      return;
    }

    const clampedWidth = applyEditorPreviewWidth(editorPreviewWidthRef.current);
    persistEditorPreviewWidths(clampedWidth, lastExpandedEditorPreviewWidthRef.current);
  }, [applyEditorPreviewWidth, isDesktopViewport, isPreviewOpen, persistEditorPreviewWidths]);

  useEffect(() => {
    if (!isPreviewOpen || !isDesktopViewport || !editorPreviewLayoutRef.current || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      const clampedWidth = applyEditorPreviewWidth(editorPreviewWidthRef.current);
      persistEditorPreviewWidths(clampedWidth, lastExpandedEditorPreviewWidthRef.current);
    });

    observer.observe(editorPreviewLayoutRef.current);
    return () => observer.disconnect();
  }, [applyEditorPreviewWidth, isDesktopViewport, isPreviewOpen, persistEditorPreviewWidths]);

  useEffect(() => {
    return () => {
      if (noteIdRef.current && triggerServerSync) {
        triggerServerSync(noteIdRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save effect
  useEffect(() => {
    if (!note) return;

    // Check against the LAST SAVED state (refs), not the current prop.
    // This breaks the loop because the prop update from the server won't trigger a save
    // unless it differs from what we *intended* to save (which handles external updates properly).
    // Actually, simpler: if current state matches last saved state, don't save.
    if (title === lastSavedTitle.current && content === lastSavedContent.current) {
      return;
    }

    const handler = setTimeout(() => {
      const updates: { title?: string; content?: string } = {};
      if (title !== lastSavedTitle.current) updates.title = title;
      if (content !== lastSavedContent.current) updates.content = content;
      if (Object.keys(updates).length === 0) return;
      onUpdateNote(note.id, updates);
      lastSavedTitle.current = title;
      lastSavedContent.current = content;
    }, 500);

    return () => clearTimeout(handler);
    // Remove `note` from dependencies, only depend on `note.id`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, note?.id, onUpdateNote]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    currentTitleRef.current = value;
  };

  // Called by CM6's updateListener on every doc change (after compositionEnd for IME input).
  const handleEditorChange = useCallback((value: string) => {
    currentContentRef.current = value;
    onContentChange?.(value);
    setContent(value);
    setCommittedContent(value);
    startTransition(() => {});
  }, [onContentChange]);

  // Called for programmatic content changes (checkbox, image paste).
  // CM6's setValue triggers handleEditorChange automatically via updateListener.
  const setEditorContent = useCallback((value: string) => {
    editorRef.current?.setValue(value);
  }, []);

  const markdownComponents = useMemo((): Components => ({
    input(props) {
      const { disabled: _disabled, checked, ...rest } = props as React.InputHTMLAttributes<HTMLInputElement>;
      if (rest.type !== "checkbox") return <input {...rest} />;
      return (
        <input
          {...rest}
          type="checkbox"
          defaultChecked={!!checked}
          onChange={(e) => {
            const lineSource = (e.target as HTMLElement).closest("[data-source-line]");
            if (!lineSource) return;
            const lineNumber = parseInt(lineSource.getAttribute("data-source-line") ?? "0", 10);
            if (!lineNumber) return;
            const newContent = toggleMarkdownCheckbox(currentContentRef.current, lineNumber);
            if (newContent !== currentContentRef.current) setEditorContent(newContent);
          }}
          style={{ cursor: "pointer" }}
        />
      );
    },
  }), [setEditorContent]);

  const handleBlur = () => {
    // Use refs to check for changes to ensure we have the latest values
    if (note && (currentTitleRef.current !== lastSavedTitle.current || currentContentRef.current !== lastSavedContent.current)) {
      const updates: { title?: string; content?: string } = {};
      if (currentTitleRef.current !== lastSavedTitle.current) updates.title = currentTitleRef.current;
      if (currentContentRef.current !== lastSavedContent.current) updates.content = currentContentRef.current;
      onUpdateNote(note.id, updates);
      lastSavedTitle.current = currentTitleRef.current;
      lastSavedContent.current = currentContentRef.current;
    }

    if (note && triggerServerSync) {
      triggerServerSync(note.id);
    }
  };

  const handleEditorScroll = useCallback(() => {
    if (editorScrollRafRef.current !== null) return;
    if (isScrollingRef.current) return;
    editorScrollRafRef.current = requestAnimationFrame(() => {
      editorScrollRafRef.current = null;
      const view = editorRef.current?.view();
      const preview = previewContainerRef.current;
      if (!view || !preview) return;
      const src = view.scrollDOM;
      const ratio = src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight);
      isScrollingRef.current = true;
      preview.scrollTop = ratio * Math.max(0, preview.scrollHeight - preview.clientHeight);
      setTimeout(() => { isScrollingRef.current = false; }, 50);
    });
  }, []);

  const handlePreviewScroll = useCallback(() => {
    if (previewScrollRafRef.current !== null) return;
    if (isScrollingRef.current) return;
    previewScrollRafRef.current = requestAnimationFrame(() => {
      previewScrollRafRef.current = null;
      const view = editorRef.current?.view();
      const preview = previewContainerRef.current;
      if (!view || !preview) return;
      const dst = view.scrollDOM;
      const ratio = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight);
      isScrollingRef.current = true;
      dst.scrollTop = ratio * Math.max(0, dst.scrollHeight - dst.clientHeight);
      setTimeout(() => { isScrollingRef.current = false; }, 50);
    });
  }, []);

  // Attach scroll sync to the editor's scrollDOM
  useEffect(() => {
    if (!isPreviewOpen) return;
    const view = editorRef.current?.view();
    if (!view) return;
    const scrollDOM = view.scrollDOM;
    scrollDOM.addEventListener("scroll", handleEditorScroll);
    return () => scrollDOM.removeEventListener("scroll", handleEditorScroll);
  }, [note?.id, handleEditorScroll, isPreviewOpen]);

  /**
   * 画像ファイルをサーバーにアップロードし、Markdown の画像記法をエディタに挿入するハンドラ。
   * アップロード中は「uploading」プレースホルダを挿入し、完了後に本 URL で差し替える。
   * エラー時はプレースホルダを除去する。
   */
  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB — must match backend/app/routers/images.py MAX_FILE_SIZE
    if (file.size > MAX_SIZE) {
      setImageUploadError(t("editor.imageTooLarge"));
      setTimeout(() => setImageUploadError(null), 5000);
      return;
    }

    const placeholder = `![${t("editor.uploading")}]()`;
    const currentValue = currentContentRef.current;
    const view = editorRef.current?.view();
    const insertPos = view?.state.selection.main.from ?? currentValue.length;

    setEditorContent(currentValue.slice(0, insertPos) + placeholder + currentValue.slice(insertPos));
    view?.dispatch({ selection: { anchor: insertPos + placeholder.length } });

    try {
      const api = await getApi();
      const { url } = await api.uploadImage(file);
      setEditorContent(currentContentRef.current.replace(placeholder, `![image](${url})`));
    } catch {
      setEditorContent(currentContentRef.current.replace(placeholder, ""));
    }
  }, [getApi, setEditorContent, t]);



  // Fullscreen API toggle
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await fullscreenContainerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }, []);

  // Sync React state with Fullscreen API (handles ESC key from browser)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Fullscreen keyboard shortcut (Ctrl/Cmd+Shift+F)
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "F" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [toggleFullscreen]);

  // JSON export handlers
  const handleExportMarkdown = useCallback(() => {
    const markdown = `# ${currentTitleRef.current}\n\n${currentContentRef.current}`;
    downloadFile(markdown, `${currentTitleRef.current || "untitled"}.md`, "text/markdown");
  }, []);

  const handleExportText = useCallback(() => {
    const text = `${currentTitleRef.current}\n\n${currentContentRef.current}`;
    downloadFile(text, `${currentTitleRef.current || "untitled"}.txt`, "text/plain");
  }, []);

  /**
   * 印刷プレビューハンドラ。
   * flushSync でスナップショットを同期的に DOM に反映した後、
   * body にクラスを付与して印刷専用スタイルを適用し window.print() を呼び出す。
   * afterprint イベントでクラスとスナップショットを確実にクリーンアップする。
   */
  const handlePrintPreview = useCallback(() => {
    printCleanupRef.current?.();

    let isCleanedUp = false;

    const cleanupPrintMode = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      document.body.classList.remove(PRINT_MODE_BODY_CLASS);
      window.removeEventListener("afterprint", cleanupPrintMode);
      printCleanupRef.current = null;
      setPrintSnapshot(null);
    };

    printCleanupRef.current = cleanupPrintMode;
    flushSync(() => {
      setPrintSnapshot({
        title: currentTitleRef.current,
        content: currentContentRef.current,
      });
    });
    document.body.classList.add(PRINT_MODE_BODY_CLASS);
    window.addEventListener("afterprint", cleanupPrintMode);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
      });
    });
  }, []);

  const currentFolder = folders.find((f) => f.id === note?.folder_id);
  const printPreview =
    printSnapshot && typeof document !== "undefined"
      ? createPortal(
          <div
            className="note-print-portal"
            aria-hidden="true"
            data-testid="editor-print-preview"
          >
            <h1 className="note-print-title">{printSnapshot.title || t("noteList.untitled")}</h1>
            <div className="markdown-preview prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {printSnapshot.content || `*${t("editor.previewPlaceholder")}*`}
              </ReactMarkdown>
            </div>
          </div>,
          document.body
        )
      : null;

  const isDesktopSplitPreview = isPreviewOpen && isDesktopViewport;
  const isEditorCollapsed = isDesktopSplitPreview && editorPreviewWidth <= 0;

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-lg">{t("editor.noNoteSelected")}</p>
          <p className="text-sm mt-1">{t("editor.selectNoteHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {printPreview}
      <div
        ref={fullscreenContainerRef}
        className={cn(
          "note-print-root",
          isFullscreen
            ? "flex flex-col bg-background overflow-hidden w-full h-full"
            : "flex-1 flex flex-col overflow-hidden"
        )}
      >
        <div className="note-print-screen flex flex-1 flex-col overflow-hidden">
          <EditorToolbar
            noteId={note.id}
            noteFolderId={note.folder_id}
            folders={folders}
            currentFolder={currentFolder}
            isSummarizing={isSummarizing}
            isChatOpen={isChatOpen}
            isPreviewOpen={isPreviewOpen}
            isDesktopViewport={isDesktopViewport}
            isEditorCollapsed={isEditorCollapsed}
            isFullscreen={isFullscreen}
            hasPendingEditProposal={!!pendingEditProposal}
            currentTitleRef={currentTitleRef}
            currentContentRef={currentContentRef}
            lastSavedTitleRef={lastSavedTitle}
            lastSavedContentRef={lastSavedContent}
            onUpdateNote={onUpdateNote}
            onSummarize={onSummarize}
            onOpenChat={onOpenChat}
            onPreviewToggle={handlePreviewToggle}
            onShowEditorPane={handleShowEditorPane}
            onHideEditorPane={handleHideEditorPane}
            onExportMarkdown={handleExportMarkdown}
            onExportText={handleExportText}
            onPrintPreview={handlePrintPreview}
            onToggleFullscreen={toggleFullscreen}
            onDeleteNote={onDeleteNote}
            editorDisplayMode={editorDisplayMode}
            onToggleEditorDisplayMode={handleToggleEditorDisplayMode}
          />

          {/* Editor */}
          <div className="flex-1 flex flex-col overflow-hidden" role="main" data-sentry-block>
            {/* Fixed Title Area */}
            <div className="p-4 md:p-6 pb-0 flex-none bg-background z-10">
              <div className="relative mb-4">
                <label htmlFor="note-title" className="sr-only">
                  Note title
                </label>
                <Input
                  id="note-title"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  onBlur={handleBlur}
                  placeholder={t("editor.noteTitlePlaceholder")}
                  className="text-2xl font-bold border-none shadow-none focus-visible:ring-0 px-0 h-auto"
                  data-testid="editor-title-input"
                />
              </div>
              <Separator className="mb-4" />
            </div>

            {/* Editor and Preview Layout */}
            <div
              ref={editorPreviewLayoutRef}
              className="relative flex-1 flex min-h-0 px-4 md:px-6 pb-4"
              data-testid={
                isDesktopSplitPreview
                  ? "editor-preview-desktop-layout"
                  : "editor-preview-layout"
              }
            >
              {/* Image upload error message */}
              {imageUploadError && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground text-sm px-4 py-2 rounded shadow-md">
                  {imageUploadError}
                </div>
              )}

              {pendingEditProposal ? (
                <div
                  className="flex flex-col flex-1 min-h-0"
                  data-testid="editor-diff-panel"
                >
                  <DiffView
                    originalContent={pendingEditProposal.originalContent}
                    editedContent={pendingEditProposal.editedContent}
                    onAccept={onAcceptEdit ?? (() => {})}
                    onReject={onRejectEdit ?? (() => {})}
                    isApplied={null}
                    fullSize
                  />
                </div>
              ) : (
                <>
                  {/* Markdown Editor Column */}
                  {(!isPreviewOpen || (isDesktopViewport && !isEditorCollapsed)) && (
                    <div
                      className={cn(
                        "relative min-h-0",
                        isPreviewOpen ? "flex-none min-w-0" : "flex-1",
                        isDraggingOver && "ring-2 ring-primary rounded"
                      )}
                      style={
                        isDesktopSplitPreview
                          ? { width: `${editorPreviewWidth}%` }
                          : undefined
                      }
                      ref={editorContainerRef}
                      data-testid="editor-drop-zone"
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingOver(true);
                      }}
                      onDragLeave={() => setIsDraggingOver(false)}
                      onDrop={async (e) => {
                        e.preventDefault();
                        setIsDraggingOver(false);
                        const file = e.dataTransfer.files[0];
                        if (file) await handleImageUpload(file);
                      }}
                    >
                      <MarkdownEditor
                        ref={editorRef}
                        key={note?.id}
                        initialValue={note?.content ?? ""}
                        onChange={handleEditorChange}
                        onBlur={handleBlur}
                        onSelectionChange={onSelectionChange}
                        onPasteImage={handleImageUpload}
                        placeholder={t("editor.noteContentPlaceholder")}
                        className="h-full min-h-[400px]"
                        data-testid="editor-content-input"
                        displayMode={editorDisplayMode}
                      />
                    </div>
                  )}

                  {/* Markdown Preview Column */}
                  {isPreviewOpen && (
                    <>
                      {isDesktopViewport && (
                        <div
                          role="separator"
                          tabIndex={0}
                          aria-orientation="vertical"
                          aria-label={t("editor.resizeEditorPreview")}
                          onMouseDown={handlePreviewResizeStart}
                          onDoubleClick={handlePreviewResizeDoubleClick}
                          onKeyDown={handlePreviewResizeKeyDown}
                          data-testid="editor-preview-resize-handle"
                          className={cn(
                            "flex-shrink-0 w-2 rounded-full cursor-col-resize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                            isPreviewResizing
                              ? "bg-primary/70"
                              : "bg-border/30 hover:bg-primary/50"
                          )}
                        />
                      )}
                      <EditorMarkdownPreview
                        deferredContent={deferredContent}
                        markdownComponents={markdownComponents}
                        previewContainerRef={previewContainerRef}
                        onPreviewScroll={handlePreviewScroll}
                        isDesktopViewport={isDesktopViewport}
                        previewPlaceholder={t("editor.previewPlaceholder")}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <EditorStatusBar
            contentLength={content.length}
            currentHash={currentHash}
            savedHash={savedHash}
            syncStatus={syncStatus}
            tokenUsage={tokenUsage}
            updatedAt={note.updated_at}
          />
        </div>
      </div>
    </>
  );
}
