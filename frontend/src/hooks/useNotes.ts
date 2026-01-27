"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApi } from "./useApi";
import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import type { Note } from "@/types";

// Debounce helper for auto-save using useRef to avoid re-renders
function useDebounce<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  ) as T;
}

interface UseNotesReturn {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  isSaving: boolean;
  saveError: string | null;
  savedLocally: boolean;
  handleCreateNote: () => Promise<void>;
  handleUpdateNote: (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => void;
  handleDeleteNote: (id: string) => Promise<void>;
}

export function useNotes(
  notes: Note[],
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>,
  selectedFolderId: string | null,
  selectedNoteId: string | null,
  setSelectedNoteId: (id: string | null) => void
): UseNotesReturn {
  const { getApi } = useApi();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedLocally, setSavedLocally] = useState(false);

  /**
   * Save note to local IndexedDB and optionally sync to server
   */
  const saveNoteToStorage = async (
    id: string,
    updates: { title?: string; content?: string; folder_id?: string | null },
    note: Note
  ) => {
    // Always save to IndexedDB first
    const updatedNote = { ...note, ...updates, updated_at: new Date().toISOString() };
    await notesDB.saveNote(updatedNote);

    // Check if online
    if (navigator.onLine) {
      try {
        const apiClient = await getApi();
        const serverNote = await apiClient.updateNote(id, updates);
        // Update with server response (has authoritative updated_at)
        setNotes((prev) =>
          prev.map((n) =>
            n.id === id
              ? { ...n, updated_at: serverNote.updated_at }
              : n
          )
        );
        setSavedLocally(false);
      } catch (error) {
        console.error("Failed to sync note to server:", error);
        // Queue for later sync
        await syncQueue.addChange("update", "note", id, updates);
        setSavedLocally(true);
        throw error;
      }
    } else {
      // Offline: queue for later sync
      await syncQueue.addChange("update", "note", id, updates);
      setSavedLocally(true);
    }
  };

  const debouncedUpdateNote = useDebounce(
    async (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => {
      setIsSaving(true);
      setSaveError(null);
      setSavedLocally(false);
      
      try {
        const note = notes.find((n) => n.id === id);
        if (!note) return;

        await saveNoteToStorage(id, updates, note);
      } catch (error) {
        console.error("Failed to update note:", error);
        // Only show error if even local save failed
        if (!savedLocally) {
          setSaveError("保存に失敗しました");
        }
      } finally {
        setIsSaving(false);
      }
    },
    500
  );

  const handleCreateNote = async () => {
    // Generate a temporary ID for offline-created notes
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    
    const newNote: Note = {
      id: tempId,
      title: "",
      content: "",
      folder_id: selectedFolderId,
      user_id: "", // Will be set by server
      created_at: now,
      updated_at: now,
    };

    // Optimistic update
    setNotes((prev) => [newNote, ...prev]);
    setSelectedNoteId(tempId);

    // Save to IndexedDB immediately
    await notesDB.saveNote(newNote);

    if (navigator.onLine) {
      try {
        const apiClient = await getApi();
        const serverNote = await apiClient.createNote({
          title: "",
          content: "",
          folder_id: selectedFolderId,
        });
        
        // Replace temp note with server note
        setNotes((prev) =>
          prev.map((n) => (n.id === tempId ? serverNote : n))
        );
        setSelectedNoteId(serverNote.id);
        
        // Update IndexedDB with server note
        await notesDB.deleteNote(tempId);
        await notesDB.saveNote(serverNote);
      } catch (error) {
        console.error("Failed to create note on server:", error);
        // Queue for later sync
        await syncQueue.addChange("create", "note", tempId, {
          title: "",
          content: "",
          folder_id: selectedFolderId,
        });
      }
    } else {
      // Offline: queue for later sync
      await syncQueue.addChange("create", "note", tempId, {
        title: "",
        content: "",
        folder_id: selectedFolderId,
      });
    }
  };

  const handleUpdateNote = useCallback((
    id: string,
    updates: { title?: string; content?: string; folder_id?: string | null }
  ) => {
    // Optimistic update
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
    );
    debouncedUpdateNote(id, updates);
  }, [setNotes, debouncedUpdateNote]);

  const handleDeleteNote = async (id: string) => {
    try {
      // Optimistic update
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
      }

      // Delete from IndexedDB
      await notesDB.deleteNote(id);

      if (navigator.onLine) {
        try {
          const apiClient = await getApi();
          await apiClient.deleteNote(id);
        } catch (error) {
          console.error("Failed to delete note on server:", error);
          // Queue for later sync (unless it's a temp note)
          if (!id.startsWith("temp-")) {
            await syncQueue.addChange("delete", "note", id);
          }
        }
      } else {
        // Offline: queue for later sync (unless it's a temp note)
        if (!id.startsWith("temp-")) {
          await syncQueue.addChange("delete", "note", id);
        }
      }
    } catch (error) {
      console.error("Failed to delete note:", error);
    }
  };

  return {
    notes,
    setNotes,
    isSaving,
    saveError,
    savedLocally,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
  };
}
