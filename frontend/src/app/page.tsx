"use client";

import { useState, useEffect } from "react";
import {
  ThreeColumnLayout,
  Sidebar,
  NoteList,
  EditorPanel,
  SettingsDialog,
  type MobileView,
} from "@/components/layout";
import { AIChatPanel } from "@/components/ai";
import { LandingPage } from "@/components/landing";
import { useAuth } from "@/lib/auth-context";
import { useFolders, useNotes, useAIChat, useApi } from "@/hooks";
import { Button } from "@/components/ui/button";
import { LogOutIcon, Loader2Icon, SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Home() {
  const { user, isLoading: authLoading, isAuthenticated, signOut } = useAuth();
  const { getApi } = useApi();
  
  // UI State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("folders");

  // Custom hooks
  const {
    folders,
    setFolders,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
  } = useFolders(selectedFolderId, setSelectedFolderId);

  // Handle folder selection with mobile view change
  const handleSelectFolder = (id: string | null) => {
    setSelectedFolderId(id);
    setMobileView("notes");
  };

  // Handle note selection with mobile view change
  const handleSelectNote = (id: string) => {
    setSelectedNoteId(id);
    setMobileView("editor");
  };

  const {
    notes,
    setNotes,
    isSaving,
    saveError,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
  } = useNotes(selectedFolderId, selectedNoteId, setSelectedNoteId);

  const {
    chatMessages,
    summary,
    isAILoading,
    handleSummarize,
    handleSendMessage,
    clearSummary,
  } = useAIChat(selectedNoteId);

  // Selected note
  const selectedNote = notes.find((n) => n.id === selectedNoteId) || null;

  // Selected folder name
  const selectedFolderName = folders.find((f) => f.id === selectedFolderId)?.name;

  // Filtered notes by folder
  const filteredNotes = selectedFolderId
    ? notes.filter((n) => n.folder_id === selectedFolderId)
    : notes;

  // Load initial data when authenticated
  useEffect(() => {
    async function loadData() {
      if (!isAuthenticated) {
        setIsLoading(false);
        return;
      }

      try {
        const apiClient = await getApi();
        
        const [foldersData, notesData] = await Promise.all([
          apiClient.listFolders(),
          apiClient.listNotes(),
        ]);
        setFolders(foldersData);
        setNotes(notesData);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    if (!authLoading) {
      loadData();
    }
  }, [isAuthenticated, authLoading, getApi, setFolders, setNotes]);

  // Close chat when note changes
  useEffect(() => {
    setIsChatOpen(false);
  }, [selectedNoteId]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!isAuthenticated) {
    return <LandingPage />;
  }

  // Show loading while fetching data
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
    <ThreeColumnLayout
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        sidebar={
          <div className="flex flex-col h-full">
            <Sidebar
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelectFolder={handleSelectFolder}
              onCreateFolder={handleCreateFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onToggleCollapse={() => setIsSidebarOpen(!isSidebarOpen)}
            />
            {/* User info and sign out */}
            <div className={cn(
              "p-4 border-t border-border/50 transition-all duration-300",
              !isSidebarOpen && "items-center justify-center p-2"
            )}>
              <div className={cn(
                "flex items-center",
                isSidebarOpen ? "justify-between" : "justify-center"
              )}>
                {isSidebarOpen && (
                  <span className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setIsSettingsOpen(true)}
                  title="Settings"
                >
                  <SettingsIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={signOut}
                  title="Sign out"
                >
                  <LogOutIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        }
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
        noteList={
          <NoteList
            notes={filteredNotes}
            selectedNoteId={selectedNoteId}
            onSelectNote={handleSelectNote}
            onCreateNote={handleCreateNote}
            folderName={selectedFolderName}
            folderId={selectedFolderId}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
          />
        }
        editor={
          <div className="flex flex-1 h-full">
            <EditorPanel
              note={selectedNote}
              folders={folders}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onSummarize={handleSummarize}
              onOpenChat={() => setIsChatOpen(!isChatOpen)}
              isChatOpen={isChatOpen}
              isSummarizing={isAILoading}
              isSaving={isSaving}
              saveError={saveError}
            />
            <AIChatPanel
              isOpen={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              isLoading={isAILoading}
              summary={summary}
              onClearSummary={clearSummary}
            />
          </div>
        }
    />
    <SettingsDialog
      open={isSettingsOpen}
      onOpenChange={setIsSettingsOpen}
    />
    </>
  );
}
