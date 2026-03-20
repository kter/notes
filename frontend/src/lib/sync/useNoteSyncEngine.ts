"use client";

import { useCallback, useRef, useState } from "react";

import { useTranslation } from "@/hooks/useTranslation";
import { notesDB } from "@/lib/indexedDB";
import { syncQueue } from "@/lib/syncQueue";
import { calculateHash } from "@/lib/utils";
import {
  getWorkspaceSyncRequestMetadata,
  isConflictApiError,
  persistWorkspaceSnapshot,
  refreshWorkspaceSnapshot,
} from "@/lib/workspaceSync";
import { useApi } from "@/hooks/useApi";
import type { Note, WorkspaceSnapshotResponse } from "@/types";

import { useDebouncedAsync } from "./useDebouncedAsync";
import type { LocalSyncStatus, RemoteSyncStatus, SyncStatus } from "./types";

const NOOP_SNAPSHOT_SYNC: (snapshot: WorkspaceSnapshotResponse) => void = () => {};

interface NoteSyncEngineParams {
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  onSnapshotSynced?: (snapshot: WorkspaceSnapshotResponse) => void;
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
  onSnapshotSynced,
}: NoteSyncEngineParams): NoteSyncEngineResult {
  const { getApi } = useApi();
  const { t } = useTranslation();
  const [localStatus, setLocalStatus] = useState<LocalSyncStatus>("saved");
  const [remoteStatus, setRemoteStatus] = useState<RemoteSyncStatus>("synced");
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const [savedHashes, setSavedHashes] = useState<Record<string, string>>({});
  const activeSavePromiseRef = useRef<Promise<void> | null>(null);
  const handleSnapshotSynced = onSnapshotSynced ?? NOOP_SNAPSHOT_SYNC;

  const syncNoteToServer = useCallback(
    async (id: string, updates: NoteSyncUpdates, expectedVersion?: number) => {
      if (navigator.onLine) {
        const task = async () => {
          setRemoteStatus("syncing");
          setLastError(undefined);
          try {
            const apiClient = await getApi();
            const response = await apiClient.applyWorkspaceChanges({
              ...getWorkspaceSyncRequestMetadata(),
              changes: [
                {
                  entity: "note",
                  operation: "update",
                  entity_id: id,
                  expected_version: expectedVersion,
                  payload: updates,
                },
              ],
            });
            const serverNote = response.applied[0]?.note;
            if (!serverNote) {
              throw new Error("Workspace changes response did not include the updated note");
            }

            setNotes((prev) =>
              prev.map((note) =>
                note.id === id ? serverNote : note
              )
            );

            await persistWorkspaceSnapshot(response.snapshot);
            handleSnapshotSynced(response.snapshot);

            const hash = await calculateHash(serverNote.content);
            setSavedHashes((prev) => ({ ...prev, [id]: hash }));

            setRemoteStatus("synced");
            setLocalStatus("saved");
          } catch (error) {
            if (isConflictApiError(error)) {
              const apiClient = await getApi();
              await refreshWorkspaceSnapshot(apiClient, {
                onSnapshotSynced: handleSnapshotSynced,
              });
              setRemoteStatus("failed");
              setLastError(t("sync.conflictReloaded"));
              return;
            }
            console.error("Failed to sync note to server:", error);
            await syncQueue.addChange("update", "note", id, updates, {
              expectedVersion,
            });
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

      await syncQueue.addChange("update", "note", id, updates, {
        expectedVersion,
      });
      setRemoteStatus("failed");
      setLastError(t("sync.offlineSyncUnavailable"));
    },
    [getApi, handleSnapshotSynced, setNotes, t]
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
      version: 1,
      created_at: now,
      updated_at: now,
      deleted_at: null,
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
        const response = await apiClient.applyWorkspaceChanges({
          ...getWorkspaceSyncRequestMetadata(),
          changes: [
            {
              entity: "note",
              operation: "create",
              payload: {
                title: "",
                content: "",
                folder_id: selectedFolderId,
              },
            },
          ],
        });
        const serverNote = response.applied[0]?.note;
        if (!serverNote) {
          throw new Error("Workspace changes response did not include the created note");
        }

        const hash = await calculateHash(serverNote.content);
        setSavedHashes((prev) => ({ ...prev, [serverNote.id]: hash }));

        setNotes((prev) =>
          prev.map((note) => (note.id === tempId ? serverNote : note))
        );
        setSelectedNoteId(serverNote.id);

        await notesDB.deleteNote(tempId);
        await persistWorkspaceSnapshot(response.snapshot);
        handleSnapshotSynced(response.snapshot);
        setRemoteStatus("synced");
      } catch (error) {
        if (isConflictApiError(error)) {
          const apiClient = await getApi();
          await refreshWorkspaceSnapshot(apiClient, {
            onSnapshotSynced: handleSnapshotSynced,
          });
          setRemoteStatus("failed");
          setLastError(t("sync.conflictReloaded"));
          return;
        }
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
  }, [getApi, handleSnapshotSynced, selectedFolderId, setNotes, setSelectedNoteId, t]);

  const handleUpdateNote = useCallback(
    async (id: string, updates: NoteSyncUpdates) => {
      let noteForLocalSave: Note | undefined;
      setNotes((prev) => {
        noteForLocalSave = prev.find((note) => note.id === id);
        return prev.map((note) =>
          note.id === id
            ? {
                ...note,
                ...updates,
                version: note.version + 1,
                updated_at: new Date().toISOString(),
                deleted_at: null,
              }
            : note
        );
      });

      try {
        if (noteForLocalSave) {
          const updatedNote = {
            ...noteForLocalSave,
            ...updates,
            version: noteForLocalSave.version + 1,
            updated_at: new Date().toISOString(),
            deleted_at: null,
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
      debouncedServerSync(id, updates, noteForLocalSave?.version);
    },
    [debouncedServerSync, setNotes, t]
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      try {
        cancelServerSync();
        const noteToDelete = await notesDB.getNote(id);

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
            const response = await apiClient.applyWorkspaceChanges({
              ...getWorkspaceSyncRequestMetadata(),
              changes: [
                {
                  entity: "note",
                  operation: "delete",
                  entity_id: id,
                  expected_version: noteToDelete?.version,
                },
              ],
            });
            await persistWorkspaceSnapshot(response.snapshot);
            handleSnapshotSynced(response.snapshot);
          } catch (error) {
            if (isConflictApiError(error)) {
              const apiClient = await getApi();
              await refreshWorkspaceSnapshot(apiClient, {
                onSnapshotSynced: handleSnapshotSynced,
              });
              setRemoteStatus("failed");
              setLastError(t("sync.conflictReloaded"));
              return;
            }
            console.error("Failed to delete note on server:", error);
            if (!id.startsWith("temp-")) {
              await syncQueue.addChange("delete", "note", id, undefined, {
                expectedVersion: noteToDelete?.version,
              });
            }
          }
          return;
        }

        if (!id.startsWith("temp-")) {
          await syncQueue.addChange("delete", "note", id, undefined, {
            expectedVersion: noteToDelete?.version,
          });
        }
      } catch (error) {
        console.error("Failed to delete note:", error);
      }
    },
    [cancelServerSync, getApi, handleSnapshotSynced, selectedNoteId, setNotes, setSelectedNoteId, t]
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
