"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock } from "@/components/Clock";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { Note, Folder } from "@/types";
import { useApi, useTranslation } from "@/hooks";
import { SparklesIcon, TrashIcon, MessageSquareIcon, FolderIcon, ChevronDownIcon, Loader2Icon, CheckIcon, DownloadIcon, EyeIcon, EyeOffIcon, AlertCircleIcon, HashIcon } from "lucide-react";
import { useEffect, useState, useRef, useCallback, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Debounce helper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebounce<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  ) as T;
}

interface EditorPanelProps {
  note: Note | null;
  folders: Folder[];
  onUpdateNote: (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => void;
  onDeleteNote: (id: string) => void;
  onSummarize: (id: string) => void;
  onOpenChat: () => void;
  isChatOpen: boolean;
  isSummarizing?: boolean;
  isSaving?: boolean;
  saveError?: string | null;
  savedLocally?: boolean;
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
  isSaving = false,
  saveError = null,
  savedLocally = false,
}: EditorPanelProps) {
  const { getApi } = useApi();
  const { t } = useTranslation();
  // Initialize state from props - reliance on key={note.id} in parent to reset state on switch
  const [title, setTitle] = useState(note?.title ?? "");
  const [content, setContent] = useState(note?.content ?? "");
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Refs to track the last saved state to avoid loops with optimistic updates
  const lastSavedTitle = useRef(note?.title ?? "");
  const lastSavedContent = useRef(note?.content ?? "");

  // Update refs when note changes to a different one (switched notes)
  useEffect(() => {
    lastSavedTitle.current = note?.title ?? "";
    lastSavedContent.current = note?.content ?? "";
    // We also need to update local state if the note prop changes and it's NOT what we just saved.
    // However, the existing logic `useState(note?.title)` only runs on mount.
    // The key={note.id} in parent ensures re-mount on switch.
    // So we don't need to sync state here, just refs.
  }, [note?.id, note?.title, note?.content]);

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
  };

  const handleContentChange = (value: string) => {
    setContent(value);
  };

  const handleFolderChange = (folderId: string | null) => {
    if (note) {
      onUpdateNote(note.id, { folder_id: folderId });
    }
    setIsFolderDropdownOpen(false);
  };

  const handleGenerateTitle = async () => {
    if (!note || !content.trim() || isGeneratingTitle) return;
    
    setIsGeneratingTitle(true);
    try {
      const apiClient = await getApi();
      const response = await apiClient.generateTitle({ note_id: note.id });
      setTitle(response.title);
      onUpdateNote(note.id, { title: response.title });
    } catch (error) {
      console.error("Failed to generate title:", error);
    } finally {
      setIsGeneratingTitle(false);
    }
  };

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
  }, [note, onUpdateNote]);

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
  }, [note, onUpdateNote, getListMarkerInfo]);

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

  // Export handlers
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
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
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                      !note.folder_id ? "bg-accent" : ""
                    }`}
                    onClick={() => handleFolderChange(null)}
                  >
                    {t("sidebar.allNotes")}
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                        note.folder_id === folder.id ? "bg-accent" : ""
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
            onClick={() => onSummarize(note.id)}
            disabled={isSummarizing}
            className="gap-1 md:gap-2"
            aria-label={t("editor.summarizeNote")}
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
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className="gap-1 md:gap-2"
          >
            {isPreviewOpen ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
            <span className="hidden md:inline">{t("editor.preview")}</span>
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(t("noteList.deleteConfirm"))) {
              onDeleteNote(note.id);
            }
          }}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col p-4 md:p-6 overflow-auto" role="main">
        <div className="relative mb-4">
          <label htmlFor="note-title" className="sr-only">Note title</label>
          <Input
            id="note-title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder={t("editor.noteTitlePlaceholder")}
            className="text-2xl font-bold border-none shadow-none focus-visible:ring-0 px-0 pr-10 h-auto"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={handleGenerateTitle}
            disabled={!content.trim() || isGeneratingTitle}
            title={t("editor.generateTitleFromContent")}
          >
            {isGeneratingTitle ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SparklesIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
        <Separator className="mb-4" />
        
        {/* Editor and Preview Area */}
        <div className={`flex-1 flex ${isPreviewOpen ? "gap-4" : ""}`}>
          {/* Markdown Editor */}
          <div className={isPreviewOpen ? "flex-1 min-w-0" : "flex-1"}>
            <label htmlFor="note-content" className="sr-only">Note content</label>
            <Textarea
              id="note-content"
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("editor.noteContentPlaceholder")}
              className="h-full resize-none border-none shadow-none focus-visible:ring-0 px-0 text-base leading-relaxed min-h-[400px] font-mono"
            />
          </div>
          
          {/* Markdown Preview */}
          {isPreviewOpen && (
            <>
              <Separator orientation="vertical" />
              <div className="flex-1 min-w-0 overflow-auto">
                <div className="markdown-preview prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content || `*${t("editor.previewPlaceholder")}*`}
                  </ReactMarkdown>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="relative flex flex-wrap items-center justify-between px-4 md:px-6 py-2 border-t border-border/50 text-xs text-muted-foreground gap-y-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            {saveError ? (
              <>
                <AlertCircleIcon className="h-3 w-3 text-destructive" />
                <span className="text-destructive font-medium">{saveError}</span>
              </>
            ) : isSaving ? (
              <>
                <Loader2Icon className="h-3 w-3 animate-spin" />
                <span>{t("common.loading")}</span>
              </>
            ) : savedLocally ? (
              <>
                <CheckIcon className="h-3 w-3 text-amber-500" />
                <span className="text-amber-600">{t("sync.savedLocally")}</span>
              </>
            ) : (
              <>
                <CheckIcon className="h-3 w-3 text-green-500" />
                <span>{t("common.saved")}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 border-l border-border/50 pl-4">
            <HashIcon className="h-3 w-3" />
            <span>
              {t("editor.characters")}: <span className="font-medium text-foreground">{content.length}</span>
            </span>
          </div>
        </div>
        
        {/* Clock - Absolutely centered */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
           <Clock />
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
    </div>
  );
}
