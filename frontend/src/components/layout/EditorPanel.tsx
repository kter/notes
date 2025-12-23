"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { Note, Folder } from "@/types";
import { SparklesIcon, TrashIcon, MessageSquareIcon, FolderIcon, ChevronDownIcon, Loader2Icon, CheckIcon } from "lucide-react";
import { useEffect, useState, useRef } from "react";

interface EditorPanelProps {
  note: Note | null;
  folders: Folder[];
  onUpdateNote: (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => void;
  onDeleteNote: (id: string) => void;
  onSummarize: (id: string) => void;
  onOpenChat: () => void;
  isChatOpen: boolean;
  isSaving?: boolean;
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
}: EditorPanelProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
        <Textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Start writing your note..."
          className="flex-1 resize-none border-none shadow-none focus-visible:ring-0 px-0 text-base leading-relaxed min-h-[400px]"
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-6 py-2 border-t border-border/50 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          {isSaving ? (
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
