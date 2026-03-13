"use client";

import { LogOutIcon, SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WorkspaceSidebarFooterProps {
  isSidebarOpen: boolean;
  userEmail?: string;
  onOpenSettings: () => void;
  onSignOut: () => void | Promise<void>;
}

export function WorkspaceSidebarFooter({
  isSidebarOpen,
  userEmail,
  onOpenSettings,
  onSignOut,
}: WorkspaceSidebarFooterProps) {
  return (
    <div
      className={cn(
        "p-4 border-t border-border/50 transition-all duration-300",
        !isSidebarOpen && "items-center justify-center p-2",
        "pb-20 md:pb-4"
      )}
    >
      <div
        className={cn(
          "flex items-center",
          isSidebarOpen ? "justify-between" : "justify-center"
        )}
      >
        {isSidebarOpen && (
          <span className="text-xs text-muted-foreground truncate">{userEmail}</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onOpenSettings}
          title="Settings"
        >
          <SettingsIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onSignOut}
          title="Sign out"
        >
          <LogOutIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
