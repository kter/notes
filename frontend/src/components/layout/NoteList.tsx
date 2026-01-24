"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import type { Note } from "@/types";
import { cn } from "@/lib/utils";
import { 
  FilePlusIcon, 
  FileTextIcon, 
  PencilIcon, 
  TrashIcon, 
  CheckIcon, 
  XIcon,
  SearchIcon 
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks";

interface NoteListProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  folderName?: string;
  folderId?: string | null;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
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
  searchQuery = "",
  onSearchChange,
}: NoteListProps) {
  const { t } = useTranslation();
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
      if (confirm(t("sidebar.deleteConfirm"))) {
        onDeleteFolder(folderId);
      }
    }
  };

  // Helper function to highlight text
  const HighlightedText = ({ text, highlight }: { text: string; highlight: string }) => {
    if (!highlight.trim()) return <>{text}</>;

    const parts = text.split(new RegExp(`(${highlight})`, "gi"));
    return (
      <>
        {parts.map((part, i) => 
          part.toLowerCase() === highlight.toLowerCase() ? (
            <span key={i} className="search-highlight">
              {part}
            </span>
          ) : (
            part
          )
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50 space-y-3">
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
                  {folderName || t("sidebar.allNotes")}
                </h2>
                {folderId && onRenameFolder && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 flex-shrink-0"
                    onClick={handleStartEdit}
                    title={t("noteList.renameFolder")}
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
                    title={t("noteList.deleteFolder")}
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
                aria-label={t("noteList.addNote")}
              >
                <FilePlusIcon className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={t("noteList.searchPlaceholder")}
            className="h-8 pl-8 text-sm bg-muted/50 border-transparent focus:bg-background focus:border-input transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange?.("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {notes.length === 1 
            ? t("noteList.noteCountSingular").replace("{{count}}", "1")
            : t("noteList.noteCount").replace("{{count}}", String(notes.length))}
        </p>
      </div>

      {/* Note list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {notes.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {searchQuery ? (
                <span>No results found for &quot;{searchQuery}&quot;</span>
              ) : (
                <>
                  {t("noteList.noNotes")}
                  <br />
                  <button
                    className="text-primary hover:underline mt-2"
                    onClick={onCreateNote}
                  >
                    {t("noteList.createOne")}
                  </button>
                </>
              )}
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
                      <HighlightedText 
                        text={note.title || t("noteList.untitled")} 
                        highlight={searchQuery} 
                      />
                    </h3>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      <HighlightedText 
                        text={note.content.slice(0, 50) || t("noteList.noContent")} 
                        highlight={searchQuery} 
                      />
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

