import { useMemo, useSyncExternalStore } from "react";
import { Note } from "@/types";
import { noteBodyStore } from "@/lib/sync/noteBodyStore";

export function useNoteFilter(
  notes: Note[],
  selectedFolderId: string | null,
  searchQuery: string
) {
  // Subscribe to noteBodyStore so search results refresh when note bodies change.
  const bodyVersion = useSyncExternalStore(
    noteBodyStore.subscribe,
    () => noteBodyStore.version(),
    () => 0
  );

  // Fingerprint tracks only folder membership changes (id + folder_id), not snippet/updated_at.
  // This prevents folderFiltered from re-running on every auto-save that doesn't move notes.
  const folderFingerprint = useMemo(
    () => notes.map((n) => `${n.id}:${n.folder_id ?? ""}`).join("|"),
    [notes]
  );

  // Stage 1: folder filter — never touches content
  const folderFiltered = useMemo(
    () => (selectedFolderId ? notes.filter((n) => n.folder_id === selectedFolderId) : notes),
    // Depend on folderFingerprint instead of notes to skip re-runs when only
    // snippet/updated_at/version change (which can't affect folder membership).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folderFingerprint, selectedFolderId]
  );

  // Stage 2: search filter — skipped entirely when query is empty
  const filteredNotes = useMemo(() => {
    if (!searchQuery) return folderFiltered;
    const query = searchQuery.toLowerCase();
    return folderFiltered.filter((n) => {
      if (n.title?.toLowerCase().includes(query)) return true;
      // Use noteBodyStore when available (has() distinguishes "empty" from "not loaded").
      // Fall back to n.content (snapshot value) only for notes not yet opened in this session.
      const body = noteBodyStore.has(n.id) ? noteBodyStore.get(n.id) : (n.content ?? "");
      return body.toLowerCase().includes(query);
    });
    // bodyVersion ensures re-evaluation when note bodies change in the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderFiltered, searchQuery, bodyVersion]);

  return filteredNotes;
}
