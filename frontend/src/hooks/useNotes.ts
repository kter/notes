"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApi } from "./useApi";
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
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

interface UseNotesReturn {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  isSaving: boolean;
  saveError: string | null;
  handleCreateNote: () => Promise<void>;
  handleUpdateNote: (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => void;
  handleDeleteNote: (id: string) => Promise<void>;
}

export function useNotes(
  selectedFolderId: string | null,
  selectedNoteId: string | null,
  setSelectedNoteId: (id: string | null) => void
): UseNotesReturn {
  const { getApi } = useApi();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const debouncedUpdateNote = useDebounce(
    async (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const apiClient = await getApi();
        const note = await apiClient.updateNote(id, updates);
        // Only update metadata (updated_at), not content/title to avoid overwriting user input
        setNotes((prev) =>
          prev.map((n) =>
            n.id === id
              ? { ...n, updated_at: note.updated_at }
              : n
          )
        );
      } catch (error) {
        console.error("Failed to update note:", error);
        setSaveError("保存に失敗しました");
      } finally {
        setIsSaving(false);
      }
    },
    500
  );

  const handleCreateNote = async () => {
    try {
      const apiClient = await getApi();
      const note = await apiClient.createNote({
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
      const apiClient = await getApi();
      await apiClient.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedNoteId === id) {
        setSelectedNoteId(null);
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
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
  };
}
