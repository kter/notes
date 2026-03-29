"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock } from "@/components/Clock";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { Note, Folder, TokenUsageRead, EditProposal } from "@/types";
import { DiffView } from "@/components/ai/DiffView";
import { useApi, useTranslation } from "@/hooks";
import { TokenUsageIndicator } from "@/components/TokenUsageIndicator";
import { SparklesIcon, TrashIcon, MessageSquareIcon, FolderIcon, ChevronDownIcon, Loader2Icon, CheckIcon, DownloadIcon, EyeIcon, EyeOffIcon, HashIcon, Share2Icon, Maximize2Icon, Minimize2Icon } from "lucide-react";
import { useEffect, useState, useRef, useCallback, useMemo, KeyboardEvent, useDeferredValue } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkSourceLine } from "@/lib/remark-source-line";
import { toggleMarkdownCheckbox } from "@/lib/markdownCheckboxToggle";
import type { SyncStatus } from "@/hooks/useNotes";
import { calculateHash, cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShareDialog } from "@/components/ui/ShareDialog";
import type { NoteShare } from "@/types";

const DESKTOP_BREAKPOINT = 768;
const DEFAULT_EDITOR_PREVIEW_WIDTH = 50;
const MIN_PREVIEW_WIDTH_PX = 280;
const PREVIEW_RESIZE_HANDLE_WIDTH_PX = 8;
const EDITOR_PREVIEW_WIDTH_STORAGE_KEY = "notes-editor-preview-width";
const EDITOR_PREVIEW_LAST_WIDTH_STORAGE_KEY = "notes-editor-preview-last-width";

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
  contentOverride?: { content: string; version: number } | null;
  pendingEditProposal?: EditProposal | null;
  onAcceptEdit?: () => void;
  onRejectEdit?: () => void;
}

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
  // Initialize state from props - reliance on key={note.id} in parent to reset state on switch
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  // Use deferred content for preview to prevent input lag during heavy markdown rendering
  const deferredContent = useDeferredValue(content);
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
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
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [currentShare, setCurrentShare] = useState<NoteShare | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const editorPreviewLayoutRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const contentLinesRef = useRef(1);
  const scrollRafRef = useRef<number | null>(null);
  const editorPreviewWidthRef = useRef(editorPreviewWidth);
  const lastExpandedEditorPreviewWidthRef = useRef(lastExpandedEditorPreviewWidth);

  // Cache line count whenever content changes (cheap ref update, avoids O(n) split in scroll handlers)
  useEffect(() => {
    let count = 1;
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10) count++;
    }
    contentLinesRef.current = count;
  }, [content]);

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

  // Calculate hash of current content whenever it changes (debounced to avoid blocking typing)
  useEffect(() => {
    const calculate = async () => {
      const hash = await calculateHash(content);
      setCurrentHash(hash);
    };
    const timer = setTimeout(calculate, 500);
    return () => clearTimeout(timer);
  }, [content]);

  // Refs to track the last saved state to avoid loops with optimistic updates
  const lastSavedTitle = useRef(note?.title ?? "");
  const lastSavedContent = useRef(note?.content ?? "");

  // Refs to track current state for immediate access in callbacks
  const currentTitleRef = useRef(title);
  const currentContentRef = useRef(content);

  // Update refs when note changes to a different one (switched notes)
  useEffect(() => {
    lastSavedTitle.current = note?.title ?? "";
    lastSavedContent.current = note?.content ?? "";
    currentTitleRef.current = note?.title ?? "";
    currentContentRef.current = note?.content ?? "";
    // We also need to update local state if the note prop changes and it's NOT what we just saved.
    // However, the existing logic `useState(note?.title)` only runs on mount.
    // The key={note.id} in parent ensures re-mount on switch.
    // So we don't need to sync state here, just refs.
    onContentChange?.(note?.content ?? "");
  }, [note?.id, note?.title, note?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply content override from AI edit accept
  const contentOverrideVersionRef = useRef<number>(-1);
  useEffect(() => {
    if (contentOverride && contentOverride.version !== contentOverrideVersionRef.current) {
      contentOverrideVersionRef.current = contentOverride.version;
      handleContentChange(contentOverride.content);
    }
  }, [contentOverride]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger server sync on unmount or when switching notes
  // Store note.id in a ref so cleanup function has access to the current value
  const noteIdRef = useRef(note?.id);
  useEffect(() => {
    noteIdRef.current = note?.id;
  }, [note?.id]);

  // Clean up pending RAF on unmount
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
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
      onUpdateNote(note.id, { title, content });
      // Update refs to reflect that we've triggered a save for this content
      lastSavedTitle.current = title;
      lastSavedContent.current = content;
    }, 500);

    return () => clearTimeout(handler);
    // Remove `note` from dependencies, only depend on `note.id`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, note?.id, onUpdateNote]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFolderDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    currentTitleRef.current = value;
  };

  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    currentContentRef.current = value;
    onContentChange?.(value);
  }, [onContentChange]);

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
            // closest("[data-source-line]") works for both the <li> (production, via
            // remarkSourceLine) and the <input> itself (tests, where the mock passes
            // data-source-line directly as a prop).
            const lineSource = (e.target as HTMLElement).closest("[data-source-line]");
            if (!lineSource) return;
            const lineNumber = parseInt(lineSource.getAttribute("data-source-line") ?? "0", 10);
            if (!lineNumber) return;
            const newContent = toggleMarkdownCheckbox(currentContentRef.current, lineNumber);
            if (newContent !== currentContentRef.current) handleContentChange(newContent);
          }}
          style={{ cursor: "pointer" }}
        />
      );
    },
  }), [handleContentChange]);

  const handleBlur = () => {
    // Use refs to check for changes to ensure we have the latest values
    if (note && (currentTitleRef.current !== lastSavedTitle.current || currentContentRef.current !== lastSavedContent.current)) {
      onUpdateNote(note.id, { title: currentTitleRef.current, content: currentContentRef.current });
      lastSavedTitle.current = currentTitleRef.current;
      lastSavedContent.current = currentContentRef.current;
    }

    if (note && triggerServerSync) {
      triggerServerSync(note.id);
    }
  };

  const handleFolderChange = (folderId: string | null) => {
    if (note) {
      onUpdateNote(note.id, { folder_id: folderId });
    }
    setIsFolderDropdownOpen(false);
  };



  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    const MAX_SIZE = 10 * 1024 * 1024; // 10MB — must match backend/app/routers/images.py MAX_FILE_SIZE
    if (file.size > MAX_SIZE) {
      setImageUploadError(t("editor.imageTooLarge"));
      setTimeout(() => setImageUploadError(null), 5000);
      return;
    }

    const placeholder = `![${t("editor.uploading")}]()`;
    const textarea = textareaRef.current;
    const insertPos = textarea ? textarea.selectionStart : content.length;

    const newContent =
      content.slice(0, insertPos) + placeholder + content.slice(insertPos);
    handleContentChange(newContent);

    try {
      const api = await getApi();
      const { url } = await api.uploadImage(file);
      setContent((prev) => prev.replace(placeholder, `![image](${url})`));
    } catch {
      setContent((prev) => prev.replace(placeholder, ""));
    }
  }, [content, getApi, handleContentChange, t]);

  // Helper: Get list marker information from current line
  interface ListMarkerInfo {
    fullMatch: string;
    indent: string;
    marker: string | undefined;
    markerSpace: string;
    contentAfterMarker: string;
  }

  const getListMarkerInfo = useCallback((currentLine: string): ListMarkerInfo | null => {
    // Match leading whitespace and optional list markers
    // Supports: -, *, +, 1., 2., etc.
    const match = currentLine.match(/^(\s*)([-*+]|\d+\.)?(\s*)/);
    if (!match) return null;

    const [fullMatch, indent, marker, markerSpace] = match;
    return {
      fullMatch,
      indent: indent || "",
      marker,
      markerSpace: markerSpace || "",
      contentAfterMarker: currentLine.slice(fullMatch.length),
    };
  }, []);

  // Handle Tab/Shift+Tab for indentation
  const handleTabKey = useCallback((
    e: KeyboardEvent<HTMLTextAreaElement>,
    textarea: HTMLTextAreaElement
  ): void => {
    e.preventDefault();

    const { selectionStart, selectionEnd, value } = textarea;

    // Handle multi-line selection
    if (selectionStart !== selectionEnd) {
      const startPos = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const endPos = value.indexOf("\n", selectionEnd);
      const effectiveEndPos = endPos === -1 ? value.length : endPos;

      const selection = value.slice(startPos, effectiveEndPos);
      const lines = selection.split("\n");
      let newSelection = "";
      let totalOffsetStart = 0;
      let totalOffsetEnd = 0;

      if (e.shiftKey) {
        // Unindent multiple lines
        newSelection = lines
          .map((line, index) => {
            const indentMatch = line.match(/^(\s{1,2})/);
            const spacesToRemove = indentMatch ? indentMatch[1].length : 0;

            if (index === 0) {
              totalOffsetStart -= Math.min(spacesToRemove, Math.max(0, selectionStart - startPos));
            }
            totalOffsetEnd -= spacesToRemove;

            return line.slice(spacesToRemove);
          })
          .join("\n");
      } else {
        // Indent multiple lines
        newSelection = lines
          .map((line) => {
            totalOffsetEnd += 2;
            return "  " + line;
          })
          .join("\n");
        totalOffsetStart = 2;
      }

      // Use document.execCommand to preserve undo history
      textarea.setSelectionRange(startPos, effectiveEndPos);
      document.execCommand("insertText", false, newSelection);

      // Adjust cursor position
      const newStart = Math.max(startPos, selectionStart + totalOffsetStart);
      const newEnd = selectionEnd + totalOffsetEnd;
      textarea.setSelectionRange(newStart, newEnd);
      return;
    }

    // Find the start of the current line
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const currentLine = value.slice(lineStart, selectionStart);

    // Check if the line is a list item (starts with optional whitespace + list marker)
    const listMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)\s/);

    if (listMatch || currentLine.match(/^\s+/)) {
      // We're in a list item or indented line
      if (e.shiftKey) {
        // Shift+Tab: Remove indentation (2 spaces from the beginning of the line)
        const lineContent = value.slice(lineStart);
        const indentMatch = lineContent.match(/^(\s{1,2})/);

        if (indentMatch) {
          const spacesToRemove = indentMatch[1].length;

          // Use document.execCommand to preserve undo history
          textarea.setSelectionRange(lineStart, lineStart + spacesToRemove);
          document.execCommand("delete");

          // Adjust cursor position
          const newPos = Math.max(lineStart, selectionStart - spacesToRemove);
          textarea.setSelectionRange(newPos, newPos);
        }
      } else {
        // Tab: Add indentation (2 spaces at the beginning of the line)
        textarea.setSelectionRange(lineStart, lineStart);
        document.execCommand("insertText", false, "  ");

        // Adjust cursor position
        const newPos = selectionStart + 2;
        textarea.setSelectionRange(newPos, newPos);
      }
    } else {
      // Not in a list item - insert tab characters at cursor position
      if (e.shiftKey) {
        // Optional: handle Shift+Tab even for non-list items if it has leading spaces
        const lineContent = value.slice(lineStart);
        const indentMatch = lineContent.match(/^(\s{1,2})/);
        if (indentMatch) {
          const spacesToRemove = indentMatch[1].length;

          // Use document.execCommand to preserve undo history
          textarea.setSelectionRange(lineStart, lineStart + spacesToRemove);
          document.execCommand("delete");

          const newPos = Math.max(lineStart, selectionStart - spacesToRemove);
          textarea.setSelectionRange(newPos, newPos);
          return;
        }
      }

      // Insert 2 spaces at current cursor position
      document.execCommand("insertText", false, "  ");
    }
  }, []);

  // Handle Enter key for list continuation
  const handleEnterKey = useCallback((
    e: KeyboardEvent<HTMLTextAreaElement>,
    textarea: HTMLTextAreaElement
  ): void => {
    const { selectionStart, value } = textarea;

    // Find the start of the current line
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const currentLine = value.slice(lineStart, selectionStart);

    const markerInfo = getListMarkerInfo(currentLine);
    if (!markerInfo) return;

    const { indent, marker, markerSpace, contentAfterMarker } = markerInfo;

    // Check if the line only contains the marker (empty list item)
    if (marker && contentAfterMarker.trim() === "") {
      // Empty list item - remove the marker and indent on Enter
      e.preventDefault();

      // Use document.execCommand to preserve undo history
      textarea.setSelectionRange(lineStart, selectionStart);
      document.execCommand("insertText", false, "\n");
      return;
    }

    // Build the continuation string
    let continuation = indent;
    if (marker) {
      // Increment number for ordered lists
      const numMatch = marker.match(/^(\d+)\.$/);
      if (numMatch) {
        continuation += (parseInt(numMatch[1], 10) + 1) + "." + markerSpace;
      } else {
        continuation += marker + markerSpace;
      }
    }

    // Only intercept if there's something to continue
    if (continuation) {
      e.preventDefault();

      // Use document.execCommand to preserve undo history
      document.execCommand("insertText", false, "\n" + continuation);

      // Scroll to keep cursor visible
      requestAnimationFrame(() => {
        textarea.blur();
        textarea.focus();
      });
    }
  }, [getListMarkerInfo]);

  // Main keyboard event handler - delegates to specific handlers
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Skip handling during IME composition (e.g., Japanese input)
    if (e.nativeEvent.isComposing) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    if (e.key === "Tab") {
      handleTabKey(e, textarea);
      return;
    }

    if (e.key === "Enter") {
      handleEnterKey(e, textarea);
    }
  }, [handleTabKey, handleEnterKey]);



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

  const isDesktopSplitPreview = isPreviewOpen && isDesktopViewport;
  const isEditorCollapsed = isDesktopSplitPreview && editorPreviewWidth <= 0;
  const isSplitPreviewVisible = isDesktopSplitPreview && !isEditorCollapsed;

  // Scroll Sync Handlers (throttled with requestAnimationFrame, no content dependency)
  const handleEditorScroll = useCallback(() => {
    if (isScrollingRef.current || !isSplitPreviewVisible || !textareaRef.current || !previewContainerRef.current) return;
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!textareaRef.current || !previewContainerRef.current) return;

      isScrollingRef.current = true;

      const editor = textareaRef.current;
      const preview = previewContainerRef.current;

      const contentLines = contentLinesRef.current;
      const scrollPercentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
      const targetLine = Math.floor(contentLines * scrollPercentage);

      const elements = Array.from(preview.querySelectorAll("[data-source-line]")) as HTMLElement[];
      let targetElement = null;

      for (const el of elements) {
        const line = parseInt(el.getAttribute("data-source-line") || "0", 10);
        if (line >= targetLine) {
          targetElement = el;
          break;
        }
      }

      if (targetElement) {
        preview.scrollTop = targetElement.offsetTop - preview.offsetTop;
      } else if (scrollPercentage > 0.99) {
        preview.scrollTop = preview.scrollHeight;
      }

      setTimeout(() => {
        isScrollingRef.current = false;
      }, 50);
    });
  }, [isSplitPreviewVisible]);

  const handlePreviewScroll = useCallback(() => {
    if (isScrollingRef.current || !isSplitPreviewVisible || !textareaRef.current || !previewContainerRef.current) return;
    if (scrollRafRef.current !== null) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (!textareaRef.current || !previewContainerRef.current) return;

      isScrollingRef.current = true;

      const editor = textareaRef.current;
      const preview = previewContainerRef.current;
      const contentLines = contentLinesRef.current;

      const elements = Array.from(preview.querySelectorAll("[data-source-line]")) as HTMLElement[];
      let visibleElement: HTMLElement | null = null;

      for (const el of elements) {
        if (el.offsetTop - preview.offsetTop >= preview.scrollTop) {
          visibleElement = el;
          break;
        }
      }

      if (visibleElement) {
        const line = parseInt(visibleElement.getAttribute("data-source-line") || "0", 10);
        const targetScrollTop = (line / contentLines) * (editor.scrollHeight - editor.clientHeight);
        editor.scrollTop = targetScrollTop;
      }

      setTimeout(() => {
        isScrollingRef.current = false;
      }, 50);
    });
  }, [isSplitPreviewVisible]);

  // JSON export handlers
  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportDropdownOpen(false);
  };

  const handleExportMarkdown = () => {
    if (!note) return;
    const markdown = `# ${title}\n\n${content}`;
    const filename = `${title || "untitled"}.md`;
    downloadFile(markdown, filename, "text/markdown");
  };

  const handleExportText = () => {
    if (!note) return;
    const text = `${title}\n\n${content}`;
    const filename = `${title || "untitled"}.txt`;
    downloadFile(text, filename, "text/plain");
  };

  const currentFolder = folders.find((f) => f.id === note?.folder_id);

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

  // --- SAVE STATUS LOGIC START ---

  let statusIcon = null;
  let statusText = "";
  let statusTooltip = "";
  let statusColorClass = "";

  // Destructure syncStatus
  const { remote: remoteStatus, lastError, isSaving, retryCountdown } = syncStatus;

  // Hash-based Verification Logic
  // If no savedHash is available yet (initial load), fall back to remoteStatus checks temporarily
  // Strict mismatch: We have a server hash, and it differs from current.
  const isStrictlyMismatch = !!savedHash && !!currentHash && savedHash !== currentHash;

  // Loose mismatch: We don't have a hash yet (first edit), but the system knows it's unsynced.
  const isLooselyMismatch = !savedHash && remoteStatus === 'unsynced';

  if (isSaving) {
    statusIcon = <Loader2Icon className="h-3 w-3 animate-spin" />;
    statusText = t("common.loading");
    statusTooltip = t("sync.savingRemote");
    statusColorClass = "text-muted-foreground";
  } else if (remoteStatus === 'failed') {
    // Remote Failed
    statusIcon = <CheckIcon className="h-3 w-3" />;
    statusText = t("sync.failedSavedLocally");
    if (retryCountdown !== undefined) {
      statusText += " " + t("sync.retryingIn").replace("{{seconds}}", String(retryCountdown));
    }
    statusTooltip = t("sync.remoteSaveFailed");
    statusColorClass = "text-orange-500";
  } else if (isStrictlyMismatch || isLooselyMismatch) {
    // Unsaved state (Strict or Loose)
    statusIcon = <div className="h-2 w-2 rounded-full bg-orange-300" />;
    statusText = t("editor.unsaved");
    statusTooltip = isStrictlyMismatch ? t("editor.unsavedStrictMismatch") : t("editor.unsavedLooseMismatch");
    statusColorClass = "text-muted-foreground";
  } else {
    // Default / Success / Verified
    statusIcon = <CheckIcon className="h-3 w-3" />;
    statusText = t("common.saved");
    statusTooltip = t("sync.savedVerified");
    statusColorClass = "text-green-500";
  }

  // Append error detail if present
  if (lastError) {
    statusTooltip += ` (${lastError})`;
  }
  // --- SAVE STATUS LOGIC END ---

  return (
    <div ref={fullscreenContainerRef} className={isFullscreen ? "flex flex-col bg-background overflow-hidden w-full h-full" : "flex-1 flex flex-col overflow-hidden"}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 md:p-4 p-2 border-b border-border/50">
        <div className="flex items-center gap-1 md:gap-2 flex-wrap">
          {/* Folder Selector */}
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
              className="gap-1 md:gap-2"
              data-testid="editor-folder-dropdown"
            >
              <FolderIcon className="h-4 w-4" />
              <span className="max-w-[80px] md:max-w-[120px] truncate hidden sm:inline">
                {currentFolder?.name || t("sidebar.allNotes")}
              </span>
              <ChevronDownIcon className="h-3 w-3" />
            </Button>
            {isFolderDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${!note.folder_id ? "bg-accent" : ""
                      }`}
                    onClick={() => handleFolderChange(null)}
                  >
                    {t("sidebar.allNotes")}
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${note.folder_id === folder.id ? "bg-accent" : ""
                        }`}
                      onClick={() => handleFolderChange(folder.id)}
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Ensure we save any pending changes before summarizing
              if (note && (currentTitleRef.current !== lastSavedTitle.current || currentContentRef.current !== lastSavedContent.current)) {
                onUpdateNote(note.id, { title: currentTitleRef.current, content: currentContentRef.current });
                lastSavedTitle.current = currentTitleRef.current;
                lastSavedContent.current = currentContentRef.current;
              }
              onSummarize(note.id);
            }}
            disabled={isSummarizing}
            className="gap-1 md:gap-2"
            aria-label={t("editor.summarizeNote")}
            data-testid="editor-summarize-button"
          >
            {isSummarizing ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SparklesIcon className="h-4 w-4" />
            )}
            <span className="hidden md:inline">{isSummarizing ? t("editor.summarizing") : t("editor.summarize")}</span>
          </Button>
          <Button
            variant={isChatOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onOpenChat}
            className="gap-1 md:gap-2"
            aria-label={t("editor.toggleChat")}
            data-testid="editor-chat-button"
          >
            <MessageSquareIcon className="h-4 w-4" />
            <span className="hidden md:inline">{t("editor.chat")}</span>
          </Button>
          {/* Export Button */}
          <div className="relative" ref={exportDropdownRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="gap-1 md:gap-2"
              aria-label={t("editor.exportNote")}
              data-testid="editor-export-dropdown"
            >
              <DownloadIcon className="h-4 w-4" />
              <span className="hidden md:inline">{t("editor.export")}</span>
              <ChevronDownIcon className="h-3 w-3" />
            </Button>
            {isExportDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    onClick={handleExportMarkdown}
                    data-testid="editor-export-markdown"
                  >
                    {t("editor.markdown")}
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    onClick={handleExportText}
                  >
                    {t("editor.plainText")}
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Preview Toggle Button */}
          <Button
            variant={isPreviewOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={handlePreviewToggle}
            className="gap-1 md:gap-2"
            data-testid="editor-preview-toggle"
            disabled={!!pendingEditProposal}
          >
            {isPreviewOpen ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
            <span className="hidden md:inline">{t("editor.preview")}</span>
          </Button>
          {isPreviewOpen && !pendingEditProposal && (
            <Button
              variant="ghost"
              size="sm"
              onClick={
                isDesktopViewport
                  ? (isEditorCollapsed ? handleShowEditorPane : handleHideEditorPane)
                  : () => setIsPreviewOpen(false)
              }
              className="gap-1"
              data-testid={isDesktopViewport
                ? (isEditorCollapsed ? "editor-show-button" : "editor-hide-button")
                : "editor-show-button"}
            >
              <span>
                {isDesktopViewport
                  ? (isEditorCollapsed ? t("editor.showEditor") : t("editor.hideEditor"))
                  : t("editor.showEditor")}
              </span>
            </Button>
          )}
          {/* Share Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              setIsShareDialogOpen(true);
              setIsShareLoading(true);
              try {
                const api = await getApi();
                const share = await api.getNoteShare(note.id);
                setCurrentShare(share);
              } catch {
                setCurrentShare(null);
              } finally {
                setIsShareLoading(false);
              }
            }}
            className="gap-1 md:gap-2"
            aria-label={t("editor.shareNote")}
            data-testid="editor-share-button"
          >
            <Share2Icon className="h-4 w-4" />
            <span className="hidden md:inline">{t("editor.share")}</span>
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? t("editor.exitFullscreen") : t("editor.fullscreen")}
            data-testid="editor-fullscreen-button"
            title={isFullscreen ? t("editor.exitFullscreen") : t("editor.fullscreen")}
          >
            {isFullscreen ? (
              <Minimize2Icon className="h-4 w-4" />
            ) : (
              <Maximize2Icon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(t("noteList.deleteConfirm"))) {
                onDeleteNote(note.id);
              }
            }}
            data-testid="editor-delete-note-button"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col overflow-hidden" role="main">
        {/* Fixed Title Area */}
        <div className="p-4 md:p-6 pb-0 flex-none bg-background z-10">
          <div className="relative mb-4">
            <label htmlFor="note-title" className="sr-only">Note title</label>
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
          data-testid={isDesktopSplitPreview ? "editor-preview-desktop-layout" : "editor-preview-layout"}
        >
          {/* Image upload error message */}
          {imageUploadError && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-destructive text-destructive-foreground text-sm px-4 py-2 rounded shadow-md">
              {imageUploadError}
            </div>
          )}

          {pendingEditProposal ? (
            <div className="flex flex-col flex-1 min-h-0" data-testid="editor-diff-panel">
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
                    "min-h-0",
                    isPreviewOpen ? "flex-none min-w-0" : "flex-1",
                    isDraggingOver && "ring-2 ring-primary rounded"
                  )}
                  style={isDesktopSplitPreview ? { width: `${editorPreviewWidth}%` } : undefined}
                  ref={editorContainerRef}
                  data-testid="editor-drop-zone"
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                  onDragLeave={() => setIsDraggingOver(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) await handleImageUpload(file);
                  }}
                >
                  <label htmlFor="note-content" className="sr-only">Note content</label>
                  <Textarea
                    id="note-content"
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onScroll={handleEditorScroll}
                    onBlur={handleBlur}
                    onPaste={async (e) => {
                      const file = e.clipboardData.files[0];
                      if (file?.type.startsWith("image/")) {
                        e.preventDefault();
                        await handleImageUpload(file);
                      }
                    }}
                    placeholder={t("editor.noteContentPlaceholder")}
                    className="h-full resize-none border-none shadow-none focus-visible:ring-0 px-0 text-base leading-relaxed min-h-[400px] font-mono"
                    data-testid="editor-content-input"
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
                        isPreviewResizing ? "bg-primary/70" : "bg-border/30 hover:bg-primary/50"
                      )}
                    />
                  )}
                  <div
                    className={cn(
                      "min-w-0 overflow-y-auto",
                      isDesktopViewport ? "flex-1" : "w-full"
                    )}
                    ref={previewContainerRef}
                    onScroll={isSplitPreviewVisible ? handlePreviewScroll : undefined}
                    data-testid="editor-preview-pane"
                  >
                    <div className="markdown-preview prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkSourceLine]}
                        components={markdownComponents}
                      >
                        {deferredContent || `*${t("editor.previewPlaceholder")}*`}
                      </ReactMarkdown>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="relative flex flex-wrap items-center justify-between px-4 md:px-6 py-2 border-t border-border/50 text-xs text-muted-foreground gap-y-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1" data-testid="sync-status">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1 cursor-help ${statusColorClass}`}>
                    {statusIcon}
                    <span className="font-medium">{statusText}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{statusTooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-1 border-l border-border/50 pl-4">
            <HashIcon className="h-3 w-3" />
            <span>
              {t("editor.characters")}: <span className="font-medium text-foreground">{content.length}</span>
            </span>
          </div>
        </div>

        {/* Clock and Token Usage - Absolutely centered */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4">
          <Clock />
          {tokenUsage && (
            <TokenUsageIndicator
              tokensUsed={tokenUsage.tokens_used}
              tokenLimit={tokenUsage.token_limit}
              resetDate={tokenUsage.period_end}
            />
          )}
        </div>

        <div className="whitespace-nowrap">
          {t("editor.lastSaved")}: {new Date(note.updated_at).toLocaleString("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>

      {/* Share Dialog */}
      <ShareDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        shareUrl={currentShare ? `${window.location.origin}/shared?token=${currentShare.share_token}` : null}
        isLoading={isShareLoading}
        onCreateShare={async () => {
          setIsShareLoading(true);
          try {
            const api = await getApi();
            const share = await api.createNoteShare(note.id);
            setCurrentShare(share);
          } finally {
            setIsShareLoading(false);
          }
        }}
        onRevokeShare={async () => {
          setIsShareLoading(true);
          try {
            const api = await getApi();
            await api.deleteNoteShare(note.id);
            setCurrentShare(null);
          } finally {
            setIsShareLoading(false);
          }
        }}
      />
    </div>
  );
}
