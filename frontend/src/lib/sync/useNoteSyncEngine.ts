"use client";

import { useCallback, useRef, useState } from "react";

import { useTranslation } from "@/hooks/useTranslation";
import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import { calculateHash } from "@/lib/utils";
import { useApi } from "@/hooks/useApi";
import type { Note } from "@/types";

import { useDebouncedAsync } from "./useDebouncedAsync";
import type { LocalSyncStatus, RemoteSyncStatus, SyncStatus } from "./types";

interface NoteSyncEngineParams {
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
}

interface NoteSyncEngineResult {
  syncStatus: SyncStatus;
  handleCreateNote: () => Promise<void>;
  handleUpdateNote: (id: string, updates: NoteSyncUpdates) => void;
  handleDeleteNote: (id: string) => Promise<void>;
  triggerServerSync: (id: string) => Promise<void> | void;
  savedHashes: Record<string, string>;
}

type NoteSyncUpdates = {
  title?: string;
  content?: string;
  folder_id?: string | null;
};

export function useNoteSyncEngine({
  setNotes,
  selectedFolderId,
  selectedNoteId,
  setSelectedNoteId,
}: NoteSyncEngineParams): NoteSyncEngineResult {
  const { getApi } = useApi();
  const { t } = useTranslation();
  const [localStatus, setLocalStatus] = useState<LocalSyncStatus>("saved");
  const [remoteStatus, setRemoteStatus] = useState<RemoteSyncStatus>("synced");
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const [savedHashes, setSavedHashes] = useState<Record<string, string>>({});
  const activeSavePromiseRef = useRef<Promise<void> | null>(null);

  const syncNoteToServer = useCallback(
    async (id: string, updates: NoteSyncUpdates) => {
      if (navigator.onLine) {
        const task = async () => {
          setRemoteStatus("syncing");
          setLastError(undefined);
          try {
            const apiClient = await getApi();
            const serverNote = await apiClient.updateNote(id, updates);

            setNotes((prev) =>
              prev.map((note) =>
                note.id === id
                  ? { ...note, updated_at: serverNote.updated_at }
                  : note
              )
            );

            await notesDB.saveNote(serverNote);

            const hash = await calculateHash(serverNote.content);
            setSavedHashes((prev) => ({ ...prev, [id]: hash }));

            setRemoteStatus("synced");
            setLocalStatus("saved");
          } catch (error) {
            console.error("Failed to sync note to server:", error);
            await syncQueue.addChange("update", "note", id, updates);
            setRemoteStatus("failed");
            setLastError(t("sync.serverSyncFailed"));
          } finally {
            if (activeSavePromiseRef.current === currentPromise) {
              activeSavePromiseRef.current = null;
            }
          }
        };

        const currentPromise = task();
        activeSavePromiseRef.current = currentPromise;
        await currentPromise;
        return;
      }

      await syncQueue.addChange("update", "note", id, updates);
      setRemoteStatus("failed");
      setLastError(t("sync.offlineSyncUnavailable"));
    },
    [getApi, setNotes, t]
  );

  const {
    debounced: debouncedServerSync,
    flush: flushServerSync,
    cancel: cancelServerSync,
  } = useDebouncedAsync(syncNoteToServer, 5000);

  const handleCreateNote = useCallback(async () => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const newNote: Note = {
      id: tempId,
      title: "",
      content: "",
      folder_id: selectedFolderId,
      user_id: "",
      created_at: now,
      updated_at: now,
    };

    setNotes((prev) => [newNote, ...prev]);
    setSelectedNoteId(tempId);

    try {
      await notesDB.saveNote(newNote);
      setLocalStatus("saved");
    } catch {
      setLocalStatus("failed");
    }

    if (navigator.onLine) {
      setRemoteStatus("syncing");
      try {
        const apiClient = await getApi();
        const serverNote = await apiClient.createNote({
          title: "",
          content: "",
          folder_id: selectedFolderId,
        });

        const hash = await calculateHash(serverNote.content);
        setSavedHashes((prev) => ({ ...prev, [serverNote.id]: hash }));

        setNotes((prev) =>
          prev.map((note) => (note.id === tempId ? serverNote : note))
        );
        setSelectedNoteId(serverNote.id);

        await notesDB.deleteNote(tempId);
        await notesDB.saveNote(serverNote);
        setRemoteStatus("synced");
      } catch (error) {
        console.error("Failed to create note on server:", error);
        await syncQueue.addChange("create", "note", tempId, {
          title: "",
          content: "",
          folder_id: selectedFolderId,
        });
        setRemoteStatus("failed");
      }
      return;
    }

    await syncQueue.addChange("create", "note", tempId, {
      title: "",
      content: "",
      folder_id: selectedFolderId,
    });
    setRemoteStatus("failed");
  }, [getApi, selectedFolderId, setNotes, setSelectedNoteId]);

  const handleUpdateNote = useCallback(
    async (id: string, updates: NoteSyncUpdates) => {
      let noteForLocalSave: Note | undefined;
      setNotes((prev) => {
        noteForLocalSave = prev.find((note) => note.id === id);
        return prev.map((note) => (note.id === id ? { ...note, ...updates } : note));
      });

      try {
        if (noteForLocalSave) {
          const updatedNote = {
            ...noteForLocalSave,
            ...updates,
            updated_at: new Date().toISOString(),
          };
          await notesDB.saveNote(updatedNote);
          setLocalStatus("saved");
        }
      } catch (error) {
        console.error("Failed to save locally", error);
        setLocalStatus("failed");
        setLastError(t("sync.localSaveFailed"));
      }

      setRemoteStatus("unsynced");
      debouncedServerSync(id, updates);
    },
    [debouncedServerSync, setNotes, t]
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      try {
        cancelServerSync();

        setNotes((prev) => prev.filter((note) => note.id !== id));
        if (selectedNoteId === id) {
          setSelectedNoteId(null);
        }

        setSavedHashes((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });

        await notesDB.deleteNote(id);

        if (navigator.onLine) {
          try {
            const apiClient = await getApi();
            await apiClient.deleteNote(id);
          } catch (error) {
            console.error("Failed to delete note on server:", error);
            if (!id.startsWith("temp-")) {
              await syncQueue.addChange("delete", "note", id);
            }
          }
          return;
        }

        if (!id.startsWith("temp-")) {
          await syncQueue.addChange("delete", "note", id);
        }
      } catch (error) {
        console.error("Failed to delete note:", error);
      }
    },
    [cancelServerSync, getApi, selectedNoteId, setNotes, setSelectedNoteId]
  );

  const triggerServerSync = useCallback(
    async (id: string) => {
      void id;
      const flushPromise = flushServerSync();
      if (flushPromise) {
        await flushPromise;
      }
      if (activeSavePromiseRef.current) {
        await activeSavePromiseRef.current;
      }
    },
    [flushServerSync]
  );

  return {
    syncStatus: {
      local: localStatus,
      remote: remoteStatus,
      lastError,
      isSaving: remoteStatus === "syncing",
    },
    savedHashes,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
    triggerServerSync,
  };
}
