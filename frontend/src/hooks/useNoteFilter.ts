import { useMemo } from "react";
import { Note } from "@/types";
import { noteBodyStore } from "@/lib/sync/noteBodyStore";

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
    return folderFiltered.filter((n) => {
      if (n.title?.toLowerCase().includes(query)) return true;
      // Prefer noteBodyStore for latest content (n.content is stale after content-only edits).
      // Falls back to n.content for notes not yet loaded into the store.
      // TODO: replace with IndexedDB full-text index to cover notes not in store.
      const body = noteBodyStore.get(n.id) || n.content;
      return body.toLowerCase().includes(query);
    });
  }, [folderFiltered, searchQuery]);

  return filteredNotes;
}
