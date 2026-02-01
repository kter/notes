"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon, FolderIcon, FileTextIcon, PenSquareIcon, MessageSquareIcon } from "lucide-react";
import { useTranslation, useResizable } from "@/hooks";

export type MobileView = "folders" | "notes" | "editor" | "chat";

interface ThreeColumnLayoutProps {
  sidebar: ReactNode;
  noteList: ReactNode;
  editor: ReactNode;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isNoteListOpen: boolean;
  onToggleNoteList: () => void;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}

export function ThreeColumnLayout({
  sidebar,
  noteList,
  editor,
  isSidebarOpen,
  onToggleSidebar,
  isNoteListOpen,
  onToggleNoteList,
  mobileView,
  onMobileViewChange,
}: ThreeColumnLayoutProps) {
  const { t } = useTranslation();

  // Resizable sidebar
  const sidebarResize = useResizable({
    storageKey: "notes-sidebar-width",
    defaultWidth: 240,
    minWidth: 180,
    maxWidth: 400,
  });

  // Resizable note list
  const noteListResize = useResizable({
    storageKey: "notes-notelist-width",
    defaultWidth: 288,
    minWidth: 200,
    maxWidth: 500,
  });
  
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Desktop: Resizable Layout */}
      <div className="hidden md:flex w-full h-full" data-testid="desktop-layout">
        {/* Left sidebar - Folders */}
        {isSidebarOpen ? (
          <>
            <aside
              className="flex-shrink-0 border-r border-border/50 bg-sidebar h-full"
              style={{ width: sidebarResize.width }}
            >
              <div className="h-full w-full">
                {sidebar}
              </div>
            </aside>
            {/* Resize Handle */}
            <div
              className="w-1 bg-border/30 hover:bg-primary/50 active:bg-primary/70 transition-colors cursor-col-resize flex-shrink-0"
              onMouseDown={sidebarResize.handleMouseDown}
            />
          </>
        ) : (
          <aside className="flex-shrink-0 w-12 border-r border-border/50 bg-sidebar relative h-full">
            <div className="absolute inset-0 flex flex-col items-center pt-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={onToggleSidebar}
                title={t("sidebar.expandSidebar")}
                data-testid="sidebar-expand-button"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </aside>
        )}

        {/* Middle column - Note list */}
        {isNoteListOpen ? (
          <>
            <div
              className="flex-shrink-0 border-r border-border/50 bg-card/50 h-full flex flex-col"
              style={{ width: noteListResize.width }}
            >
              {noteList}
            </div>
            {/* Resize Handle */}
            <div
              className="w-1 bg-border/30 hover:bg-primary/50 active:bg-primary/70 transition-colors cursor-col-resize flex-shrink-0"
              onMouseDown={noteListResize.handleMouseDown}
            />
          </>
        ) : (
          <aside className="flex-shrink-0 w-12 border-r border-border/50 bg-card/50 relative h-full">
            <div className="absolute inset-0 flex flex-col items-center pt-4">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={onToggleNoteList}
                title={t("noteList.expandNoteList")}
                data-testid="note-list-expand-button"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          </aside>
        )}

        {/* Right column - Editor and AI panel */}
        <main className="flex-1 min-w-0 flex flex-col bg-background h-full">
          {editor}
        </main>
      </div>

      {/* Mobile: Traditional Layout with Tab Navigation */}
      {/* Left sidebar - Folders */}
      <aside 
        className={cn(
          "md:hidden flex-shrink-0 border-r border-border/50 bg-sidebar h-full",
          mobileView === "folders" ? "block w-full pb-14" : "hidden"
        )}
        data-testid="mobile-layout-folders"
      >
        <div className="h-full w-full">
          {sidebar}
        </div>
      </aside>

      {/* Middle column - Note list */}
      <div className={cn(
        "md:hidden flex-shrink-0 border-r border-border/50 bg-card/50 h-full flex flex-col",
        mobileView === "notes" ? "block w-full pb-14" : "hidden"
      )} data-testid="mobile-layout-notes">
        {noteList}
      </div>

      {/* Right column - Editor and AI panel */}
      <main className={cn(
        "md:hidden flex-1 min-w-0 flex flex-col bg-background h-full",
        (mobileView === "editor" || mobileView === "chat") ? "flex w-full pb-14" : "hidden"
      )} data-testid="mobile-layout-editor">
        {editor}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border/50 z-50">
        <div className="flex items-center justify-around h-14">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "flex-1 h-full flex flex-col items-center justify-center gap-1 rounded-none",
              mobileView === "folders" && "text-primary bg-primary/10"
            )}
            onClick={() => onMobileViewChange("folders")}
            aria-label={t("nav.viewFolders")}
            data-testid="mobile-nav-folders"
          >
            <FolderIcon className="h-5 w-5" />
            <span className="text-xs">{t("nav.folders")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "flex-1 h-full flex flex-col items-center justify-center gap-1 rounded-none",
              mobileView === "notes" && "text-primary bg-primary/10"
            )}
            onClick={() => onMobileViewChange("notes")}
            aria-label={t("nav.viewNotes")}
            data-testid="mobile-nav-notes"
          >
            <FileTextIcon className="h-5 w-5" />
            <span className="text-xs">{t("nav.notes")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "flex-1 h-full flex flex-col items-center justify-center gap-1 rounded-none",
              mobileView === "editor" && "text-primary bg-primary/10"
            )}
            onClick={() => onMobileViewChange("editor")}
            aria-label={t("nav.viewEditor")}
            data-testid="mobile-nav-editor"
          >
            <PenSquareIcon className="h-5 w-5" />
            <span className="text-xs">{t("nav.editor")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "flex-1 h-full flex flex-col items-center justify-center gap-1 rounded-none",
              mobileView === "chat" && "text-primary bg-primary/10"
            )}
            onClick={() => onMobileViewChange("chat")}
            aria-label={t("nav.viewChat")}
            data-testid="mobile-nav-chat"
          >
            <MessageSquareIcon className="h-5 w-5" />
            <span className="text-xs">{t("nav.chat")}</span>
          </Button>
        </div>
      </nav>

      {/* Style for dynamic viewport height on mobile */}
      <style jsx global>{`
        @media (max-width: 767px) {
          .h-[100dvh] {
            height: 100dvh;
          }
        }
      `}</style>
    </div>
  );
}
