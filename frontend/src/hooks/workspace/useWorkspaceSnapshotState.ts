"use client";

import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/lib/auth-context";
import { notesDB } from "@/lib/indexedDB";
import { mergeFolders, mergeNotes } from "@/lib/merge";
import {
  WORKSPACE_SYNCED_EVENT,
  getActiveFolders,
  getActiveNotes,
  persistWorkspaceSnapshot,
  type WorkspaceSyncedEventDetail,
} from "@/lib/workspaceSync";
import { useApi } from "@/hooks/useApi";
import type { Folder, Note } from "@/types";

export function useWorkspaceSnapshotState(isAuthenticated: boolean) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { isLoading: authLoading } = useAuth();
  const { getApi } = useApi();
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    async function loadData() {
      if (!isAuthenticated) {
        setIsLoading(false);
        return;
      }

      if (hasFetchedRef.current) {
        return;
      }
      hasFetchedRef.current = true;

      try {
        const [localFolders, localNotes] = await Promise.all([
          notesDB.getAllFolders(),
          notesDB.getAllNotes(),
        ]);

        if (localFolders.length > 0 || localNotes.length > 0) {
          setFolders(localFolders);
          setNotes(localNotes);
          setIsLoading(false);
        }

        if (navigator.onLine) {
          const apiClient = await getApi();
          const snapshot = await apiClient.getWorkspaceSnapshot();
          const serverFolders = getActiveFolders(snapshot);
          const serverNotes = getActiveNotes(snapshot);

          setFolders(mergeFolders(localFolders, serverFolders));
          setNotes(mergeNotes(localNotes, serverNotes));

          await persistWorkspaceSnapshot(snapshot);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    if (!authLoading) {
      void loadData();
    }
  }, [authLoading, getApi, isAuthenticated]);

  useEffect(() => {
    const handleWorkspaceSynced = (event: Event) => {
      const { detail } = event as CustomEvent<WorkspaceSyncedEventDetail>;
      setFolders(getActiveFolders(detail.snapshot));
      setNotes(getActiveNotes(detail.snapshot));
    };

    window.addEventListener(WORKSPACE_SYNCED_EVENT, handleWorkspaceSynced);
    return () => {
      window.removeEventListener(WORKSPACE_SYNCED_EVENT, handleWorkspaceSynced);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      hasFetchedRef.current = false;
    }
  }, [isAuthenticated]);

  return { folders, setFolders, notes, setNotes, isLoading };
}
