import { useState, useEffect, useRef } from "react";
import { Folder, Note } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useApi } from "./useApi";
import { notesDB } from "@/lib/indexedDB";
import { mergeNotes, mergeFolders } from "@/lib/merge";
import {
  WORKSPACE_SYNCED_EVENT,
  getActiveFolders,
  getActiveNotes,
  persistWorkspaceSnapshot,
  type WorkspaceSyncedEventDetail,
} from "@/lib/workspaceSync";

export function useHomeData(isAuthenticated: boolean) {
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

      // Prevent double-fetch in development mode
      if (hasFetchedRef.current) return;
      hasFetchedRef.current = true;

      try {
        // 1. Try to load from IndexedDB first (instant display)
        const [localFolders, localNotes] = await Promise.all([
          notesDB.getAllFolders(),
          notesDB.getAllNotes(),
        ]);

        if (localFolders.length > 0 || localNotes.length > 0) {
          setFolders(localFolders);
          setNotes(localNotes);
          setIsLoading(false);
        }

        // 2. Fetch from API to get latest data
        if (navigator.onLine) {
          const apiClient = await getApi();
          const snapshot = await apiClient.getWorkspaceSnapshot();
          const serverFolders = getActiveFolders(snapshot);
          const serverNotes = getActiveNotes(snapshot);

          const mergedFolders = mergeFolders(localFolders, serverFolders);
          const mergedNotes = mergeNotes(localNotes, serverNotes);

          setFolders(mergedFolders);
          setNotes(mergedNotes);

          await persistWorkspaceSnapshot(snapshot);
        }
      } catch (error) {
        console.error("Failed to load data:", error);
        // If API fails but we have local data, that's fine
        // If we have no local data either, show empty state
      } finally {
        setIsLoading(false);
      }
    }
    
    if (!authLoading) {
      loadData();
    }
  }, [isAuthenticated, authLoading, getApi]);

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

  // Reset fetch flag when authentication changes
  useEffect(() => {
    if (!isAuthenticated) {
      hasFetchedRef.current = false;
    }
  }, [isAuthenticated]);

  return { folders, setFolders, notes, setNotes, isLoading };
}
