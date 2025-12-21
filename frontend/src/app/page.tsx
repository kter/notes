"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ThreeColumnLayout,
  Sidebar,
  NoteList,
  EditorPanel,
} from "@/components/layout";
import { AIChatPanel } from "@/components/ai";
import { api } from "@/lib/api";
import type { Folder, Note, ChatMessage } from "@/types";

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

export default function NotesApp() {
  // State
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
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

  // Load initial data
  useEffect(() => {
    async function loadData() {
      try {
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
    loadData();
  }, []);

  // Folder handlers
  const handleCreateFolder = async (name: string) => {
    try {
      const folder = await api.createFolder({ name });
      setFolders((prev) => [folder, ...prev]);
    } catch (error) {
      console.error("Failed to create folder:", error);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    try {
      const folder = await api.updateFolder(id, { name });
      setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
    } catch (error) {
      console.error("Failed to rename folder:", error);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
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
    async (id: string, updates: { title?: string; content?: string }) => {
      try {
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
    updates: { title?: string; content?: string }
  ) => {
    // Optimistic update
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
    );
    debouncedUpdateNote(id, updates);
  };

  const handleDeleteNote = async (id: string) => {
    try {
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

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <ThreeColumnLayout
        sidebar={
          <Sidebar
            folders={folders}
            selectedFolderId={selectedFolderId}
            onSelectFolder={setSelectedFolderId}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
          />
        }
        noteList={
          <NoteList
            notes={filteredNotes}
            selectedNoteId={selectedNoteId}
            onSelectNote={setSelectedNoteId}
            onCreateNote={handleCreateNote}
            folderName={selectedFolderName}
          />
        }
        editor={
          <div className="flex flex-1 h-full">
            <EditorPanel
              note={selectedNote}
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
    </div>
  );
}
