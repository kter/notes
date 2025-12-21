"use client";

import { ReactNode } from "react";

interface ThreeColumnLayoutProps {
  sidebar: ReactNode;
  noteList: ReactNode;
  editor: ReactNode;
}

export function ThreeColumnLayout({
  sidebar,
  noteList,
  editor,
}: ThreeColumnLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left sidebar - Folders */}
      <aside className="w-60 flex-shrink-0 border-r border-border/50 bg-sidebar">
        {sidebar}
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
