"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon, FolderIcon, FileTextIcon, PenSquareIcon } from "lucide-react";

export type MobileView = "folders" | "notes" | "editor";

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
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left sidebar - Folders */}
      <aside 
        className={cn(
          "flex-shrink-0 border-r border-border/50 bg-sidebar transition-all duration-300 ease-in-out relative",
          // Desktop: always visible with normal sidebar behavior
          isSidebarOpen ? "md:w-60" : "md:w-12",
          "md:block",
          // Mobile: full width only when folders view is active, otherwise hidden
          mobileView === "folders" ? "block w-full md:w-60" : "hidden"
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
              title="Expand sidebar"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </aside>

      {/* Middle column - Note list */}
      <div className={cn(
        "flex-shrink-0 border-r border-border/50 bg-card/50",
        // Desktop: always visible with fixed width
        "md:block md:w-72",
        // Mobile: full width only when notes view is active, otherwise hidden
        mobileView === "notes" ? "block w-full" : "hidden"
      )}>
        {noteList}
      </div>

      {/* Right column - Editor and AI panel */}
      <main className={cn(
        "flex-1 min-w-0 flex flex-col bg-background",
        // Desktop: always visible
        "md:flex",
        // Mobile: visible only when editor view is active, otherwise hidden
        mobileView === "editor" ? "flex w-full" : "hidden"
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
          >
            <FolderIcon className="h-5 w-5" />
            <span className="text-xs">Folders</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "flex-1 h-full flex flex-col items-center justify-center gap-1 rounded-none",
              mobileView === "notes" && "text-primary bg-primary/10"
            )}
            onClick={() => onMobileViewChange("notes")}
          >
            <FileTextIcon className="h-5 w-5" />
            <span className="text-xs">Notes</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "flex-1 h-full flex flex-col items-center justify-center gap-1 rounded-none",
              mobileView === "editor" && "text-primary bg-primary/10"
            )}
            onClick={() => onMobileViewChange("editor")}
          >
            <PenSquareIcon className="h-5 w-5" />
            <span className="text-xs">Editor</span>
          </Button>
        </div>
      </nav>

      {/* Add padding to main content for bottom nav on mobile */}
      <style jsx global>{`
        @media (max-width: 767px) {
          .h-screen {
            height: calc(100vh - 56px);
          }
        }
      `}</style>
    </div>
  );
}
