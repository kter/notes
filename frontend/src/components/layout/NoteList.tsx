"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import type { Note } from "@/types";
import { cn } from "@/lib/utils";
import { FilePlusIcon, FileTextIcon, PencilIcon, TrashIcon, CheckIcon, XIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";

interface NoteListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  folderName?: string;
  folderId?: string | null;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
}

export function NoteList({
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  folderName,
  folderId,
  onRenameFolder,
  onDeleteFolder,
}: NoteListProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editingName, setEditingName] = useState("");

  // Cancel editing when folder changes
  useEffect(() => {
    setIsEditing(false);
    setEditingName("");
  }, [folderId]);

  const handleStartEdit = () => {
    setEditingName(folderName || "");
    setIsEditing(true);
  };

  const handleConfirmEdit = () => {
    if (folderId && editingName.trim() && onRenameFolder) {
      onRenameFolder(folderId, editingName.trim());
    }
    setIsEditing(false);
    setEditingName("");
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditingName("");
  };

  const handleDelete = () => {
    if (folderId && onDeleteFolder) {
      if (confirm("Are you sure you want to delete this folder?")) {
        onDeleteFolder(folderId);
      }
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <Input
                autoFocus
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmEdit();
                  if (e.key === "Escape") handleCancelEdit();
                }}
                className="h-7 text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-green-600 hover:text-green-700"
                onClick={handleConfirmEdit}
              >
                <CheckIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={handleCancelEdit}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  {folderName || "All Notes"}
                </h2>
                {folderId && onRenameFolder && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={handleStartEdit}
                    title="Rename folder"
                  >
                    <PencilIcon className="h-3 w-3" />
                  </Button>
                )}
                {folderId && onDeleteFolder && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0 text-destructive hover:text-destructive"
                    onClick={handleDelete}
                    title="Delete folder"
                  >
                    <TrashIcon className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={onCreateNote}
                aria-label="Add note"
              >
                <FilePlusIcon className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </p>
      </div>

      {/* Note list */}
      <ScrollArea className="flex-1 min-h-0">
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
            notes?.map((note) => (
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
