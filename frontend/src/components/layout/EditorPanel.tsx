"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import type { Note } from "@/types";
import { SparklesIcon, TrashIcon, MessageSquareIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface EditorPanelProps {
  note: Note | null;
  onUpdateNote: (id: string, updates: { title?: string; content?: string }) => void;
  onDeleteNote: (id: string) => void;
  onSummarize: (id: string) => void;
  onOpenChat: () => void;
  isChatOpen: boolean;
}

export function EditorPanel({
  note,
  onUpdateNote,
  onDeleteNote,
  onSummarize,
  onOpenChat,
  isChatOpen,
}: EditorPanelProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    } else {
      setTitle("");
      setContent("");
    }
  }, [note]);

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
    </div>
  );
}
