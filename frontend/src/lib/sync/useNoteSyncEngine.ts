"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useTranslation } from "@/hooks/useTranslation";
import { notesDB } from "@/lib/indexedDB";
import { logger } from "@/lib/logger";
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
import { SYNC_RETRY_CONFIG } from "./syncConfig";
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
  const [retryCountdown, setRetryCountdown] = useState<number | undefined>(undefined);
  const activeSavePromiseRef = useRef<Promise<void> | null>(null);
  const retryAttemptRef = useRef<number>(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryArgsRef = useRef<{ id: string; updates: NoteSyncUpdates; expectedVersion?: number } | null>(null);
  const syncNoteToServerRef = useRef<((id: string, updates: NoteSyncUpdates, expectedVersion?: number) => Promise<void>) | null>(null);
  const serverVersionByNoteIdRef = useRef<Record<string, number>>({});
  const handleSnapshotSynced = onSnapshotSynced ?? NOOP_SNAPSHOT_SYNC;

  const getExpectedVersion = useCallback(
    (noteId: string, fallbackVersion?: number) => {
      const knownVersion = serverVersionByNoteIdRef.current[noteId];
      if (knownVersion !== undefined) {
        return knownVersion;
      }

      if (fallbackVersion !== undefined) {
        serverVersionByNoteIdRef.current[noteId] = fallbackVersion;
      }

      return fallbackVersion;
    },
    []
  );

  const setServerVersion = useCallback((noteId: string, version: number) => {
    serverVersionByNoteIdRef.current[noteId] = version;
  }, []);

  const syncServerVersionsFromSnapshot = useCallback(
    (snapshot?: WorkspaceSnapshotResponse) => {
      if (!snapshot) {
        return;
      }

      const nextVersions = { ...serverVersionByNoteIdRef.current };
      for (const note of snapshot.notes) {
        if (note.deleted_at) {
          delete nextVersions[note.id];
          continue;
        }
        nextVersions[note.id] = note.version;
      }
      serverVersionByNoteIdRef.current = nextVersions;
    },
    []
  );

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
            syncServerVersionsFromSnapshot(response.snapshot);
            handleSnapshotSynced(response.snapshot);

            setServerVersion(serverNote.id, serverNote.version);
            const hash = await calculateHash(serverNote.content);
            setSavedHashes((prev) => ({ ...prev, [id]: hash }));

            retryAttemptRef.current = 0;
            retryArgsRef.current = null;
            setRetryCountdown(undefined);
            setRemoteStatus("synced");
            setLocalStatus("saved");
          } catch (error) {
            if (isConflictApiError(error)) {
              const apiClient = await getApi();
              const snapshot = await refreshWorkspaceSnapshot(apiClient, {
                onSnapshotSynced: handleSnapshotSynced,
              });
              syncServerVersionsFromSnapshot(snapshot);
              setRemoteStatus("failed");
              setLastError(t("sync.conflictReloaded"));
              return;
            }
            logger.error("Failed to sync note to server", error);
            await syncQueue.addChange("update", "note", id, updates, {
              expectedVersion,
            });
            setRemoteStatus("failed");
            setLastError(t("sync.serverSyncFailed"));

            const attempt = retryAttemptRef.current;
            if (attempt < SYNC_RETRY_CONFIG.maxRetryAttempts) {
              const delayMs = Math.min(
                SYNC_RETRY_CONFIG.retryBaseDelayMs * Math.pow(2, attempt),
                SYNC_RETRY_CONFIG.retryMaxDelayMs
              );
              const delaySec = Math.round(delayMs / 1000);
              retryArgsRef.current = { id, updates, expectedVersion };
              setRetryCountdown(delaySec);

              retryIntervalRef.current = setInterval(() => {
                setRetryCountdown((prev) => {
                  if (prev === undefined || prev <= 1) {
                    clearInterval(retryIntervalRef.current!);
                    retryIntervalRef.current = null;
                    return 0;
                  }
                  return prev - 1;
                });
              }, 1000);

              retryTimeoutRef.current = setTimeout(() => {
                retryTimeoutRef.current = null;
                clearInterval(retryIntervalRef.current!);
                retryIntervalRef.current = null;
                setRetryCountdown(undefined);
                const args = retryArgsRef.current;
                retryArgsRef.current = null;
                if (args && syncNoteToServerRef.current) {
                  retryAttemptRef.current += 1;
                  void syncNoteToServerRef.current(args.id, args.updates, args.expectedVersion);
                }
              }, delayMs);
            } else {
              setRetryCountdown(undefined); // exhausted, stay failed
            }
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
    [
      getApi,
      handleSnapshotSynced,
      setNotes,
      setServerVersion,
      syncServerVersionsFromSnapshot,
      t,
    ]
  );

  useEffect(() => {
    syncNoteToServerRef.current = syncNoteToServer;
  }, [syncNoteToServer]);

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
        setServerVersion(serverNote.id, serverNote.version);
        delete serverVersionByNoteIdRef.current[tempId];

        await notesDB.deleteNote(tempId);
        await persistWorkspaceSnapshot(response.snapshot);
        syncServerVersionsFromSnapshot(response.snapshot);
        handleSnapshotSynced(response.snapshot);
        setRemoteStatus("synced");
      } catch (error) {
        if (isConflictApiError(error)) {
          const apiClient = await getApi();
          const snapshot = await refreshWorkspaceSnapshot(apiClient, {
            onSnapshotSynced: handleSnapshotSynced,
          });
          syncServerVersionsFromSnapshot(snapshot);
          setRemoteStatus("failed");
          setLastError(t("sync.conflictReloaded"));
          return;
        }
        logger.error("Failed to create note on server", error);
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
  }, [
    getApi,
    handleSnapshotSynced,
    selectedFolderId,
    setNotes,
    setSelectedNoteId,
    setServerVersion,
    syncServerVersionsFromSnapshot,
    t,
  ]);

  const handleUpdateNote = useCallback(
    async (id: string, updates: NoteSyncUpdates) => {
      clearTimeout(retryTimeoutRef.current ?? undefined);
      clearInterval(retryIntervalRef.current ?? undefined);
      retryTimeoutRef.current = null;
      retryIntervalRef.current = null;
      retryAttemptRef.current = 0;
      retryArgsRef.current = null;
      setRetryCountdown(undefined);

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
        logger.error("Failed to save locally", error);
        setLocalStatus("failed");
        setLastError(t("sync.localSaveFailed"));
      }

      const expectedVersion = getExpectedVersion(id, noteForLocalSave?.version);
      setRemoteStatus("unsynced");
      debouncedServerSync(id, updates, expectedVersion);
    },
    [debouncedServerSync, getExpectedVersion, setNotes, t]
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      try {
        cancelServerSync();
        const noteToDelete = await notesDB.getNote(id);
        const expectedVersion = getExpectedVersion(id, noteToDelete?.version);

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
                  expected_version: expectedVersion,
                },
              ],
            });
            await persistWorkspaceSnapshot(response.snapshot);
            syncServerVersionsFromSnapshot(response.snapshot);
            delete serverVersionByNoteIdRef.current[id];
            handleSnapshotSynced(response.snapshot);
          } catch (error) {
            if (isConflictApiError(error)) {
              const apiClient = await getApi();
              const snapshot = await refreshWorkspaceSnapshot(apiClient, {
                onSnapshotSynced: handleSnapshotSynced,
              });
              syncServerVersionsFromSnapshot(snapshot);
              setRemoteStatus("failed");
              setLastError(t("sync.conflictReloaded"));
              return;
            }
            logger.error("Failed to delete note on server", error);
            if (!id.startsWith("temp-")) {
              await syncQueue.addChange("delete", "note", id, undefined, {
                expectedVersion,
              });
            }
          }
          return;
        }

        if (!id.startsWith("temp-")) {
          await syncQueue.addChange("delete", "note", id, undefined, {
            expectedVersion,
          });
        }
      } catch (error) {
        logger.error("Failed to delete note", error);
      }
    },
    [
      cancelServerSync,
      getApi,
      getExpectedVersion,
      handleSnapshotSynced,
      selectedNoteId,
      setNotes,
      setSelectedNoteId,
      syncServerVersionsFromSnapshot,
      t,
    ]
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

  // Cancel retry on note switch
  useEffect(() => {
    clearTimeout(retryTimeoutRef.current ?? undefined);
    clearInterval(retryIntervalRef.current ?? undefined);
    retryTimeoutRef.current = null;
    retryIntervalRef.current = null;
    retryAttemptRef.current = 0;
    retryArgsRef.current = null;
    setRetryCountdown(undefined);
  }, [selectedNoteId]);

  // Cancel retry on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
    };
  }, []);

  return {
    syncStatus: {
      local: localStatus,
      remote: remoteStatus,
      lastError,
      isSaving: remoteStatus === "syncing",
      retryCountdown,
    },
    savedHashes,
    handleCreateNote,
    handleUpdateNote,
    handleDeleteNote,
    triggerServerSync,
  };
}
