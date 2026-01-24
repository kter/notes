import { useState, useEffect } from "react";
import { Folder, Note } from "@/types"; // Assumptions: types are exported
import { useAuth } from "@/lib/auth-context";
import { useApi } from "./useApi";

export function useHomeData(isAuthenticated: boolean) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const { isLoading: authLoading } = useAuth();
  const { getApi } = useApi();

  useEffect(() => {
    async function loadData() {
      if (!isAuthenticated) {
        setIsLoading(false);
        return;
      }

      try {
        const apiClient = await getApi();
        
        const [foldersData, notesData] = await Promise.all([
          apiClient.listFolders(),
          apiClient.listNotes(),
        ]);
        setFolders(foldersData);
        setNotes(notesData);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setIsLoading(false);
      }
    }
    
    if (!authLoading) {
      loadData();
    }
  }, [isAuthenticated, authLoading, getApi]);

  return { folders, setFolders, notes, setNotes, isLoading };
}
