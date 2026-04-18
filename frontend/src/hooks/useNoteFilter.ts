import { useMemo } from "react";
import { Note } from "@/types";

export function useNoteFilter(
  notes: Note[],
  selectedFolderId: string | null,
  searchQuery: string
) {
  // Stage 1: folder filter — never touches content
  const folderFiltered = useMemo(
    () => (selectedFolderId ? notes.filter((n) => n.folder_id === selectedFolderId) : notes),
    [notes, selectedFolderId]
  );

  // Stage 2: search filter — skipped entirely when query is empty
  const filteredNotes = useMemo(() => {
    if (!searchQuery) return folderFiltered;
    const query = searchQuery.toLowerCase();
    return folderFiltered.filter(
      (n) =>
        (n.title?.toLowerCase().includes(query) ?? false) ||
        (n.content?.toLowerCase().includes(query) ?? false)
    );
  }, [folderFiltered, searchQuery]);

  return filteredNotes;
}
