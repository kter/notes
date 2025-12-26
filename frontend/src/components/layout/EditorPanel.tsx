"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { Note, Folder } from "@/types";
import { SparklesIcon, TrashIcon, MessageSquareIcon, FolderIcon, ChevronDownIcon, Loader2Icon, CheckIcon, DownloadIcon, EyeIcon, EyeOffIcon, AlertCircleIcon } from "lucide-react";
import { useEffect, useState, useRef, useCallback, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface EditorPanelProps {
  note: Note | null;
  folders: Folder[];
  onUpdateNote: (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => void;
  onDeleteNote: (id: string) => void;
  onSummarize: (id: string) => void;
  onOpenChat: () => void;
  isChatOpen: boolean;
  isSaving?: boolean;
  saveError?: string | null;
}

export function EditorPanel({
  note,
  folders,
  onUpdateNote,
  onDeleteNote,
  onSummarize,
  onOpenChat,
  isChatOpen,
  isSaving = false,
  saveError = null,
}: EditorPanelProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    } else {
      setTitle("");
      setContent("");
    }
  }, [note]);

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
    if (note) {
      onUpdateNote(note.id, { title: value });
    }
  };

  const handleContentChange = (value: string) => {
    setContent(value);
    if (note) {
      onUpdateNote(note.id, { content: value });
    }
  };

  const handleFolderChange = (folderId: string | null) => {
    if (note) {
      onUpdateNote(note.id, { folder_id: folderId });
    }
    setIsFolderDropdownOpen(false);
  };

  // Handle Enter key to maintain indentation and list markers
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    const { selectionStart, value } = textarea;
    
    // Find the start of the current line
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const currentLine = value.slice(lineStart, selectionStart);
    
    // Match leading whitespace and optional list markers
    // Supports: -, *, +, 1., 2., etc.
    const match = currentLine.match(/^(\s*)([-*+]|\d+\.)?(\s*)/);
    
    if (!match) return;
    
    const [fullMatch, indent, marker, markerSpace] = match;
    
    // Check if the line only contains the marker (empty list item)
    const contentAfterMarker = currentLine.slice(fullMatch.length);
    if (marker && contentAfterMarker.trim() === "") {
      // Empty list item - remove the marker and indent on Enter
      e.preventDefault();
      const beforeLine = value.slice(0, lineStart);
      const afterCursor = value.slice(selectionStart);
      const newValue = beforeLine + "\n" + afterCursor;
      
      setContent(newValue);
      if (note) {
        onUpdateNote(note.id, { content: newValue });
      }
      
      // Set cursor position after React re-render
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = lineStart + 1;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      });
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
      const before = value.slice(0, selectionStart);
      const after = value.slice(selectionStart);
      const newValue = before + "\n" + continuation + after;
      
      setContent(newValue);
      if (note) {
        onUpdateNote(note.id, { content: newValue });
      }
      
      // Set cursor position after React re-render
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = selectionStart + 1 + continuation.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      });
    }
  }, [note, onUpdateNote]);

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
          <p className="text-lg">No note selected</p>
          <p className="text-sm mt-1">Select a note from the list or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          {/* Folder Selector */}
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
              className="gap-2"
            >
              <FolderIcon className="h-4 w-4" />
              <span className="max-w-[120px] truncate">
                {currentFolder?.name || "All Notes"}
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
                    All Notes
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
            className="gap-2"
          >
            <SparklesIcon className="h-4 w-4" />
            Summarize
          </Button>
          <Button
            variant={isChatOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onOpenChat}
            className="gap-2"
          >
            <MessageSquareIcon className="h-4 w-4" />
            Chat
          </Button>
          {/* Export Button */}
          <div className="relative" ref={exportDropdownRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="gap-2"
            >
              <DownloadIcon className="h-4 w-4" />
              Export
              <ChevronDownIcon className="h-3 w-3" />
            </Button>
            {isExportDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    onClick={handleExportMarkdown}
                  >
                    Markdown (.md)
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    onClick={handleExportText}
                  >
                    Plain Text (.txt)
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
            className="gap-2"
          >
            {isPreviewOpen ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
            Preview
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => onDeleteNote(note.id)}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col p-6 overflow-auto">
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title"
          className="text-2xl font-bold border-none shadow-none focus-visible:ring-0 px-0 h-auto mb-4"
        />
        <Separator className="mb-4" />
        
        {/* Editor and Preview Area */}
        <div className={`flex-1 flex ${isPreviewOpen ? "gap-4" : ""}`}>
          {/* Markdown Editor */}
          <div className={isPreviewOpen ? "flex-1 min-w-0" : "flex-1"}>
            <Textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Start writing your note in Markdown..."
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
                    {content || "*Start writing to see the preview...*"}
                  </ReactMarkdown>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-6 py-2 border-t border-border/50 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          {saveError ? (
            <>
              <AlertCircleIcon className="h-3 w-3 text-destructive" />
              <span className="text-destructive">{saveError}</span>
            </>
          ) : isSaving ? (
            <>
              <Loader2Icon className="h-3 w-3 animate-spin" />
              <span>保存中...</span>
            </>
          ) : (
            <>
              <CheckIcon className="h-3 w-3 text-green-500" />
              <span>保存済み</span>
            </>
          )}
        </div>
        <div>
          最終更新: {new Date(note.updated_at).toLocaleString("ja-JP", {
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
