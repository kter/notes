"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon, FolderIcon, FileTextIcon, PenSquareIcon, MessageSquareIcon } from "lucide-react";
import { useTranslation } from "@/hooks";

export type MobileView = "folders" | "notes" | "editor" | "chat";

interface ThreeColumnLayoutProps {
  sidebar: ReactNode;
  noteList: ReactNode;
  editor: ReactNode;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
}

export function ThreeColumnLayout({
  sidebar,
  noteList,
  editor,
  isSidebarOpen,
  onToggleSidebar,
  mobileView,
  onMobileViewChange,
}: ThreeColumnLayoutProps) {
  const { t } = useTranslation();
  
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* Left sidebar - Folders */}
      <aside 
        className={cn(
          "flex-shrink-0 border-r border-border/50 bg-sidebar transition-all duration-300 ease-in-out relative h-full",
          // Desktop: always visible with normal sidebar behavior
          isSidebarOpen ? "md:w-60" : "md:w-12",
          "md:block",
          // Mobile: full width only when folders view is active, otherwise hidden
          mobileView === "folders" ? "block w-full md:w-60 h-full pb-14 md:pb-0" : "hidden"
        )}
      >
        <div className={cn(
          "h-full w-full transition-opacity duration-200",
          isSidebarOpen ? "md:opacity-100" : "md:opacity-0 md:invisible md:delay-0"
        )}>
          {sidebar}
        </div>

        {/* Expand button when collapsed - desktop only */}
        {!isSidebarOpen && (
          <div className="absolute inset-0 hidden md:flex flex-col items-center pt-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={onToggleSidebar}
              title={t("sidebar.expandSidebar")}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </aside>

      {/* Middle column - Note list */}
      <div className={cn(
        "flex-shrink-0 border-r border-border/50 bg-card/50 h-full flex flex-col",
        // Desktop: always visible with fixed width
        "md:block md:w-72",
        // Mobile: full width only when notes view is active, otherwise hidden
        mobileView === "notes" ? "block w-full pb-14 md:pb-0" : "hidden"
      )}>
        {noteList}
      </div>

      {/* Right column - Editor and AI panel */}
      <main className={cn(
        "flex-1 min-w-0 flex flex-col bg-background h-full",
        // Desktop: always visible
        "md:flex",
        // Mobile: visible only when editor or chat view is active, otherwise hidden
        (mobileView === "editor" || mobileView === "chat") ? "flex w-full pb-14 md:pb-0" : "hidden"
      )}>
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
