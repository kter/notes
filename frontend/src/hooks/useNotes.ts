"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useApi } from "./useApi";
import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import type { Note } from "@/types";

// Enhanced debounce helper that exposes cancellation and flushing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastArgsRef = useRef<any[] | null>(null);
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current && lastArgsRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      const result = callbackRef.current(...lastArgsRef.current);
      lastArgsRef.current = null;
      return result;
    }
  }, []);

  const debounced = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: Parameters<T>) => {
      lastArgsRef.current = args;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        callbackRef.current(...args);
        lastArgsRef.current = null;
      }, delay);
    },
    [delay]
  );

  return { debounced, cancel, flush };
}

export type LocalSyncStatus = 'saved' | 'failed' | 'unsaved';
export type RemoteSyncStatus = 'synced' | 'syncing' | 'failed' | 'unsynced';

export interface SyncStatus {
  local: LocalSyncStatus;
  remote: RemoteSyncStatus;
  lastError?: string;
  isSaving: boolean; // Aggregate saving state
}

interface UseNotesReturn {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  syncStatus: SyncStatus;
  handleCreateNote: () => Promise<void>;
  handleUpdateNote: (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => void;
  handleDeleteNote: (id: string) => Promise<void>;
  triggerServerSync: (id: string) => Promise<void> | void;
}

export function useNotes(
  notes: Note[],
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>,
  selectedFolderId: string | null,
  selectedNoteId: string | null,
  setSelectedNoteId: (id: string | null) => void
): UseNotesReturn {
  const { getApi } = useApi();
  
  // Granular status state
  const [localStatus, setLocalStatus] = useState<LocalSyncStatus>('saved');
  const [remoteStatus, setRemoteStatus] = useState<RemoteSyncStatus>('synced');
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const activeSavePromiseRef = useRef<Promise<void> | null>(null);

  // Derived aggregate saving state
  const isSaving = remoteStatus === 'syncing';

  // Separate function for server sync
  const syncNoteToServer = async (
    id: string,
    updates: { title?: string; content?: string; folder_id?: string | null }
  ) => {
    // Check if online
    if (navigator.onLine) {
       const task = async () => {
          setRemoteStatus('syncing');
          setLastError(undefined);
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
            
            // Save the authoritative version to DB as well
            await notesDB.saveNote(serverNote);
            
            setRemoteStatus('synced');
            // Local is implicitly saved if we just wrote the authoritative version
            setLocalStatus('saved');
          } catch (error) {
            console.error("Failed to sync note to server:", error);
            // Queue for later sync
            await syncQueue.addChange("update", "note", id, updates);
            setRemoteStatus('failed');
            setLastError("サーバー同期に失敗しました");
          } finally {
            if (activeSavePromiseRef.current === thisPromise) {
               activeSavePromiseRef.current = null;
            }
          }
       };
       const thisPromise = task();
       
       activeSavePromiseRef.current = thisPromise;
       await thisPromise;
    } else {
      // Offline: queue for later sync
      await syncQueue.addChange("update", "note", id, updates);
      setRemoteStatus('failed'); // Treat offline as 'failed' to sync for now, based on user requirements for "Failed to save"
      // Or 'unsynced' might be more appropriate, but 'failed' matches "Failed to Save" visually.
      // Let's stick to 'failed' for visual feedback consistency with "Remote Failed"
      setLastError("オフラインのため同期できません");
    }
  };

  // Create the debounced version of server sync
  // 5 seconds delay for server sync
  const { debounced: debouncedServerSync, flush: flushServerSync, cancel: cancelServerSync } = useDebounce(
    syncNoteToServer,
    5000 
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
    try {
      await notesDB.saveNote(newNote);
      setLocalStatus('saved');
    } catch (e) {
      setLocalStatus('failed');
    }

    if (navigator.onLine) {
      setRemoteStatus('syncing');
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
        setRemoteStatus('synced');
      } catch (error) {
        console.error("Failed to create note on server:", error);
        // Queue for later sync
        await syncQueue.addChange("create", "note", tempId, {
          title: "",
          content: "",
          folder_id: selectedFolderId,
        });
        setRemoteStatus('failed');
      }
    } else {
      // Offline: queue for later sync
      await syncQueue.addChange("create", "note", tempId, {
        title: "",
        content: "",
        folder_id: selectedFolderId,
      });
      setRemoteStatus('failed');
    }
  };

  const handleUpdateNote = useCallback(async (
    id: string,
    updates: { title?: string; content?: string; folder_id?: string | null }
  ) => {
    // 1. Optimistic Update (React State)
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...updates } : n))
    );

    // 2. Local Save (IndexedDB) - Almost immediate
    try {
      const note = notes.find((n) => n.id === id);
      if (note) {
        const updatedNote = { ...note, ...updates, updated_at: new Date().toISOString() };
        await notesDB.saveNote(updatedNote);
        setLocalStatus('saved');
      }
    } catch (err) {
      console.error("Failed to save locally", err);
      setLocalStatus('failed');
      setLastError("ローカル保存に失敗しました");
    }

    // 3. Schedule Server Sync (Debounced)
    // Mark as unsynced/pending until the debounce fires
    setRemoteStatus('unsynced');
    debouncedServerSync(id, updates);
  }, [setNotes, notes, debouncedServerSync]);

  const handleDeleteNote = async (id: string) => {
    try {
      // Cancel any pending syncs for this note
      cancelServerSync();

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

  const triggerServerSync = useCallback(async (id: string) => {
    const flushPromise = flushServerSync();
    if (flushPromise) {
        await flushPromise;
    }
    // Also wait for any active save promise (in case flush didn't trigger a new one but one was running)
    if (activeSavePromiseRef.current) {
        await activeSavePromiseRef.current;
    }
  }, [flushServerSync]);

  return {
    notes,
    setNotes,
    syncStatus: {
      local: localStatus,
      remote: remoteStatus,
      lastError,
      isSaving
    },
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
    triggerServerSync,
  };
}
