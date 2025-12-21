"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Note } from "@/types";
import { cn } from "@/lib/utils";
import { FilePlusIcon, FileTextIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface NoteListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  folderName?: string;
}

export function NoteList({
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  folderName,
}: NoteListProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider truncate">
            {folderName || "All Notes"}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onCreateNote}
          >
            <FilePlusIcon className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </p>
      </div>

      {/* Note list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {notes.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No notes yet.
              <br />
              <button
                className="text-primary hover:underline mt-2"
                onClick={onCreateNote}
              >
                Create one
              </button>
            </div>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                className={cn(
                  "w-full text-left p-3 rounded-lg transition-colors",
                  selectedNoteId === note.id
                    ? "bg-primary/10"
                    : "hover:bg-accent"
                )}
                onClick={() => onSelectNote(note.id)}
              >
                <div className="flex items-start gap-2">
                  <FileTextIcon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">
                      {note.title || "Untitled"}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {note.content.slice(0, 50) || "No content"}
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      {formatDistanceToNow(new Date(note.updated_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
