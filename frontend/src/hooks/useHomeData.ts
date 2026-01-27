import { useState, useEffect, useRef } from "react";
import { Folder, Note } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useApi } from "./useApi";
import { notesDB } from "@/lib/indexedDB";

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
          
          const [serverFolders, serverNotes] = await Promise.all([
            apiClient.listFolders(),
            apiClient.listNotes(),
          ]);

          // 3. Merge strategy: Server data takes precedence
          // But keep local-only items (temp notes created offline)
          const localOnlyNotes = localNotes.filter(
            (ln) => ln.id.startsWith("temp-") && !serverNotes.some((sn) => sn.id === ln.id)
          );
          
          const mergedNotes = [...serverNotes, ...localOnlyNotes];
          
          setFolders(serverFolders);
          setNotes(mergedNotes);

          // 4. Update IndexedDB with server data
          await notesDB.saveFolders(serverFolders);
          await notesDB.saveNotes(serverNotes);
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

  // Reset fetch flag when authentication changes
  useEffect(() => {
    if (!isAuthenticated) {
      hasFetchedRef.current = false;
    }
  }, [isAuthenticated]);

  return { folders, setFolders, notes, setNotes, isLoading };
}
