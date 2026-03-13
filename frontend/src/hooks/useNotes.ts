"use client";

import type { Note } from "@/types";
import { useNoteSyncEngine } from "@/lib/sync";
import type { SyncStatus } from "@/lib/sync";

interface UseNotesReturn {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  syncStatus: SyncStatus;
  handleCreateNote: () => Promise<void>;
  handleUpdateNote: (id: string, updates: { title?: string; content?: string; folder_id?: string | null }) => void;
  handleDeleteNote: (id: string) => Promise<void>;
  triggerServerSync: (id: string) => Promise<void> | void;
  savedHashes: Record<string, string>;
}

export function useNotes(
  notes: Note[],
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>,
  selectedFolderId: string | null,
  selectedNoteId: string | null,
  setSelectedNoteId: (id: string | null) => void
): UseNotesReturn {
  const syncEngine = useNoteSyncEngine({
    setNotes,
    selectedFolderId,
    selectedNoteId,
    setSelectedNoteId,
  });

  return {
    notes,
    setNotes,
    ...syncEngine,
  };
}
