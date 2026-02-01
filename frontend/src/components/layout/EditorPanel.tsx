"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock } from "@/components/Clock";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { Note, Folder } from "@/types";
import { useApi, useTranslation } from "@/hooks";
import { SparklesIcon, TrashIcon, MessageSquareIcon, FolderIcon, ChevronDownIcon, Loader2Icon, CheckIcon, DownloadIcon, EyeIcon, EyeOffIcon, HashIcon, XIcon } from "lucide-react";
import { useEffect, useState, useRef, useCallback, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkSourceLine } from "@/lib/remark-source-line";
import type { SyncStatus } from "@/hooks/useNotes";
import { calculateHash } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  triggerServerSync,
  savedHash,
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
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  
  // Hash-based Verification Logic
  const [currentHash, setCurrentHash] = useState("");
  
  // Calculate hash of current content whenever it changes (debounced slightly to avoid freezing typing)
  useEffect(() => {
    const calculate = async () => {
        const hash = await calculateHash(content);
        setCurrentHash(hash);
    };
    const timer = setTimeout(calculate, 200);
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
  }, [note?.id]);

  // Trigger server sync on unmount or when switching notes
  useEffect(() => {
    return () => {
      if (note && triggerServerSync) {
        triggerServerSync(note.id);
      }
    };
  }, [note?.id, triggerServerSync]);

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
    currentTitleRef.current = value;
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    currentContentRef.current = value;
  };
  
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



  // Scroll Sync Handlers
  // Scroll Sync Handlers
  const handleEditorScroll = useCallback(() => {
    if (isScrollingRef.current || !isPreviewOpen || !textareaRef.current || !previewContainerRef.current) return;
    
    isScrollingRef.current = true;
    
    const editor = textareaRef.current;
    const preview = previewContainerRef.current;
    
    // Calculate target line number based on scroll percentage of source
    // This assumes roughly uniform line height in the source which is true for monospaced textarea
    const contentLines = content.split("\n").length;
    const scrollPercentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
    const targetLine = Math.floor(contentLines * scrollPercentage);
    
    // Find the element in preview that corresponds to this line or the next closest one
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
       // Adjust for the element's position relative to the container
       preview.scrollTop = targetElement.offsetTop - preview.offsetTop;
    } else if (scrollPercentage > 0.99) {
       // If roughly at the end, sync to bottom
       preview.scrollTop = preview.scrollHeight;
    }
    
    setTimeout(() => {
      isScrollingRef.current = false;
    }, 50);
  }, [content, isPreviewOpen]);

  const handlePreviewScroll = useCallback(() => {
    if (isScrollingRef.current || !textareaRef.current || !previewContainerRef.current) return;
    
    isScrollingRef.current = true;
    
    const editor = textareaRef.current;
    const preview = previewContainerRef.current;
    const contentLines = content.split("\n").length;

    // Find the first visible element in the preview
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
  }, [content]);

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
  const { remote: remoteStatus, lastError, isSaving } = syncStatus;
  
  // Hash-based Verification Logic
  // If no savedHash is available yet (initial load), fall back to remoteStatus checks temporarily
  // Strict mismatch: We have a server hash, and it differs from current.
  const isStrictlyMismatch = !!savedHash && !!currentHash && savedHash !== currentHash;
  
  // Loose mismatch: We don't have a hash yet (first edit), but the system knows it's unsynced.
  const isLooselyMismatch = !savedHash && remoteStatus === 'unsynced';

  if (isSaving) {
    statusIcon = <Loader2Icon className="h-3 w-3 animate-spin" />;
    statusText = t("common.loading");
    statusTooltip = "リモートに保存中...";
    statusColorClass = "text-muted-foreground";
  } else if (remoteStatus === 'failed') {
      // Remote Failed
      statusIcon = <CheckIcon className="h-3 w-3" />;
      statusText = "Failed (Saved locally)";
      statusTooltip = "ローカルには保存されましたが、リモートへの保存に失敗しました";
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
      statusTooltip = "保存済み (検証完了)";
      statusColorClass = "text-green-500";
  }

  // Append error detail if present
  if (lastError) {
      statusTooltip += ` (${lastError})`;
  }
  // --- SAVE STATUS LOGIC END ---

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
            onClick={() => setIsPreviewOpen(!isPreviewOpen)}
            className="gap-1 md:gap-2"
            data-testid="editor-preview-toggle"
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
          data-testid="editor-delete-note-button"
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
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
              className="text-2xl font-bold border-none shadow-none focus-visible:ring-0 px-0 pr-10 h-auto"
              data-testid="editor-title-input"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleGenerateTitle}
              disabled={!content.trim() || isGeneratingTitle}
              title={t("editor.generateTitleFromContent")}
              data-testid="editor-generate-title-button"
            >
              {isGeneratingTitle ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
          <Separator className="mb-4" />
        </div>
        
        {/* Editor and Preview Layout */}
        <div className={`flex-1 flex min-h-0 ${isPreviewOpen ? "gap-4" : ""} px-4 md:px-6 pb-4`}>
          {/* Markdown Editor Column */}
          <div 
            className={`flex-1 min-h-0 ${isPreviewOpen ? "min-w-0" : ""}`}
            ref={editorContainerRef}
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
              placeholder={t("editor.noteContentPlaceholder")}
              className="h-full resize-none border-none shadow-none focus-visible:ring-0 px-0 text-base leading-relaxed min-h-[400px] font-mono"
              data-testid="editor-content-input"
            />
          </div>
          
          
          {/* Markdown Preview Column */}
          {isPreviewOpen && (
            <>
              <Separator orientation="vertical" />
              <div 
                className="flex-1 min-w-0 overflow-y-auto"
                ref={previewContainerRef}
                onScroll={handlePreviewScroll}
              >
                <div className="markdown-preview prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkSourceLine]}
                  >
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
