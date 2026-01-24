import { useMemo } from "react";
import { Note } from "@/types";

export function useNoteFilter(
  notes: Note[],
  selectedFolderId: string | null,
  searchQuery: string
) {
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      // Folder filter
      const matchesFolder = selectedFolderId ? n.folder_id === selectedFolderId : true;
      
      // Search filter
      const query = searchQuery.toLowerCase();
      const matchesSearch = !searchQuery || 
        (n.title?.toLowerCase().includes(query) ?? false) || 
        (n.content?.toLowerCase().includes(query) ?? false);
        
      return matchesFolder && matchesSearch;
    });
  }, [notes, selectedFolderId, searchQuery]);

  return filteredNotes;
}
