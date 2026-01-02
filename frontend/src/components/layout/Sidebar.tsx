"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import type { Folder } from "@/types";
import { cn } from "@/lib/utils";
import { FolderIcon, FolderPlusIcon, TrashIcon, PencilIcon, PanelLeftCloseIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@/hooks";

interface SidebarProps {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onToggleCollapse: () => void;
}

export function Sidebar({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onToggleCollapse,
}: SidebarProps) {
  const { t } = useTranslation();
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      onCreateFolder(newFolderName.trim());
      setNewFolderName("");
      setIsCreating(false);
    }
  };

  const handleRenameFolder = (id: string) => {
    if (editingName.trim()) {
      onRenameFolder(id, editingName.trim());
      setEditingId(null);
      setEditingName("");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 -ml-2 text-muted-foreground hover:text-foreground"
              onClick={onToggleCollapse}
              title={t("sidebar.collapseSidebar")}
            >
              <PanelLeftCloseIcon className="h-4 w-4" />
            </Button>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {t("sidebar.folders")}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsCreating(true)}
            aria-label={t("sidebar.addFolder")}
          >
            <FolderPlusIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Folder list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {/* All Notes option */}
          <button
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
              selectedFolderId === null
                ? "bg-primary/10 text-primary"
                : "text-foreground hover:bg-accent"
            )}
            onClick={() => onSelectFolder(null)}
          >
            <FolderIcon className="h-4 w-4" />
            <span>{t("sidebar.allNotes")}</span>
          </button>

          {/* New folder input */}
          {isCreating && (
            <div className="px-2 py-1">
              <Input
                autoFocus
                placeholder={t("sidebar.folderName")}
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") setIsCreating(false);
                }}
                onBlur={() => {
                  if (newFolderName.trim()) handleCreateFolder();
                  else setIsCreating(false);
                }}
                className="h-8"
              />
            </div>
          )}

          {/* Folder items */}
          {folders?.map((folder) => (
            <div key={folder.id} className="group relative">
              {editingId === folder.id ? (
                <div className="px-2 py-1">
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameFolder(folder.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onBlur={() => handleRenameFolder(folder.id)}
                    className="h-8"
                  />
                </div>
              ) : (
                <button
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors relative",
                    selectedFolderId === folder.id
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent"
                  )}
                  onClick={() => onSelectFolder(folder.id)}
                >
                  <FolderIcon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{folder.name}</span>
                  
                  {/* Action buttons - positioned absolutely to prevent layout shift */}
                  <div className={cn(
                    "absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 pl-4",
                    selectedFolderId === folder.id
                      ? "bg-gradient-to-l from-primary/10 via-primary/10 to-transparent"
                      : "bg-gradient-to-l from-accent via-accent to-transparent"
                  )}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(folder.id);
                        setEditingName(folder.name);
                      }}
                    >
                      <PencilIcon className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(t("sidebar.deleteConfirm"))) {
                          onDeleteFolder(folder.id);
                        }
                      }}
                    >
                      <TrashIcon className="h-3 w-3" />
                    </Button>
                  </div>
                </button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
