"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRightIcon } from "lucide-react";

interface ThreeColumnLayoutProps {
  sidebar: ReactNode;
  noteList: ReactNode;
  editor: ReactNode;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function ThreeColumnLayout({
  sidebar,
  noteList,
  editor,
  isSidebarOpen,
  onToggleSidebar,
}: ThreeColumnLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left sidebar - Folders */}
      <aside 
        className={cn(
          "flex-shrink-0 border-r border-border/50 bg-sidebar transition-all duration-300 ease-in-out relative",
          isSidebarOpen ? "w-60" : "w-12"
        )}
      >
        <div className={cn(
          "h-full w-full transition-opacity duration-200",
          isSidebarOpen ? "opacity-100" : "opacity-0 invisible delay-0"
        )}>
          {sidebar}
        </div>

        {/* Expand button when collapsed */}
        {!isSidebarOpen && (
          <div className="absolute inset-0 flex flex-col items-center pt-4">
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
      <div className="w-72 flex-shrink-0 border-r border-border/50 bg-card/50">
        {noteList}
      </div>

      {/* Right column - Editor and AI panel */}
      <main className="flex-1 min-w-0 flex flex-col bg-background">
        {editor}
      </main>
    </div>
  );
}
