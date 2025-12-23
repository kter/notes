"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ThreeColumnLayout,
  Sidebar,
  NoteList,
  EditorPanel,
} from "@/components/layout";
import { AIChatPanel } from "@/components/ai";
import { LandingPage } from "@/components/landing";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Folder, Note, ChatMessage } from "@/types";
import { Button } from "@/components/ui/button";
import { LogOutIcon, Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

// Debounce helper for auto-save
function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): T {
  const [pending, setPending] = useState<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (pending) clearTimeout(pending);
      setPending(setTimeout(() => callback(...args), delay));
    }) as T,
    [callback, delay, pending]
  );
}

export default function Home() {
  const { user, isLoading: authLoading, isAuthenticated, signOut, getAccessToken } = useAuth();
  
  // State
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        const token = await getAccessToken();
        if (token) {
          api.setToken(token);
        }
        
        const [foldersData, notesData] = await Promise.all([
          api.listFolders(),
          api.listNotes(),
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
  }, [isAuthenticated, authLoading, getAccessToken]);

  // Folder handlers
  const handleCreateFolder = async (name: string) => {
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      const folder = await api.createFolder({ name });
      setFolders((prev) => [folder, ...prev]);
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      const folder = await api.updateFolder(id, { name });
      setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
    } catch (error) {
      console.error("Failed to rename folder:", error);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      await api.deleteFolder(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      if (selectedFolderId === id) {
        setSelectedFolderId(null);
      }
    } catch (error) {
      console.error("Failed to delete folder:", error);
    }
  };

  // Note handlers
  const handleCreateNote = async () => {
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      const note = await api.createNote({
        title: "",
        content: "",
        folder_id: selectedFolderId,
      });
      setNotes((prev) => [note, ...prev]);
      setSelectedNoteId(note.id);
    } catch (error) {
      console.error("Failed to create note:", error);
    }
  };

  const debouncedUpdateNote = useDebounce(
    async (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => {
      try {
        const token = await getAccessToken();
        if (token) api.setToken(token);
        const note = await api.updateNote(id, updates);
        setNotes((prev) => prev.map((n) => (n.id === id ? note : n)));
      } catch (error) {
        console.error("Failed to update note:", error);
      }
    },
    500
  );

  const handleUpdateNote = (
    id: string,
    updates: { title?: string; content?: string; folder_id?: string | null }
  ) => {
    // Optimistic update
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
    );
    debouncedUpdateNote(id, updates);
  };

  const handleDeleteNote = async (id: string) => {
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  // AI handlers
  const handleSummarize = async (noteId: string) => {
    setIsAILoading(true);
    setSummary(null);
    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      const result = await api.summarizeNote({ note_id: noteId });
      setSummary(result.summary);
    } catch (error) {
      console.error("Failed to summarize:", error);
    } finally {
      setIsAILoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!selectedNoteId) return;

    const userMessage: ChatMessage = { role: "user", content: message };
    setChatMessages((prev) => [...prev, userMessage]);
    setIsAILoading(true);

    try {
      const token = await getAccessToken();
      if (token) api.setToken(token);
      const result = await api.chatWithNote({
        note_id: selectedNoteId,
        question: message,
        history: chatMessages,
      });
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: result.answer,
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Failed to chat:", error);
    } finally {
      setIsAILoading(false);
    }
  };

  // Clear chat when note changes
  useEffect(() => {
    setChatMessages([]);
    setSummary(null);
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
    <ThreeColumnLayout
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        sidebar={
          <div className="flex flex-col h-full">
            <Sidebar
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
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
                  onClick={signOut}
                  title="Sign out"
                >
                  <LogOutIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        }
        noteList={
          <NoteList
            notes={filteredNotes}
            selectedNoteId={selectedNoteId}
            onSelectNote={setSelectedNoteId}
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
            />
            <AIChatPanel
              isOpen={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              messages={chatMessages}
              onSendMessage={handleSendMessage}
              isLoading={isAILoading}
              summary={summary}
              onClearSummary={() => setSummary(null)}
            />
          </div>
        }
    />
  );
}
