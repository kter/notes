"use client";

/**
 * ノートの CRUD 操作とサーバー同期を提供するファサードフック。
 * 内部で useNoteSyncEngine を呼び出し、notes / setNotes をそのまま合成して返す。
 *
 * 主なエクスポート:
 * - useNotes: notes / setNotes / syncStatus / handleCreateNote /
 *             handleUpdateNote / handleDeleteNote / triggerServerSync /
 *             savedHashes を返す
 *
 * 呼び出し関係: useWorkspaceState から呼ばれる。
 */
import type { Note } from "@/types";
import { useNoteSyncEngine } from "@/lib/sync";
import type { SyncStatus } from "@/lib/sync";

export type { SyncStatus } from "@/lib/sync";

interface UseNotesReturn {
  notes: Note[];
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
  syncStatus: SyncStatus;
  handleCreateNote: () => Promise<void>;
  handleUpdateNote: (id: string, updates: { title?: string; content?: string; folder_id?: string | null }, options?: { immediate?: boolean }) => void;
  handleDeleteNote: (id: string) => Promise<void>;
  triggerServerSync: (id: string) => Promise<void> | void;
  savedHashes: Record<string, string>;
}

interface UseNotesOptions {
  onSnapshotSynced?: (snapshot: import("@/types").WorkspaceSnapshotResponse) => void;
}

export function useNotes(
  notes: Note[],
  setNotes: React.Dispatch<React.SetStateAction<Note[]>>,
  selectedFolderId: string | null,
  selectedNoteId: string | null,
  setSelectedNoteId: (id: string | null) => void,
  options: UseNotesOptions = {}
): UseNotesReturn {
  const syncEngine = useNoteSyncEngine({
    setNotes,
    selectedFolderId,
    selectedNoteId,
    setSelectedNoteId,
    onSnapshotSynced: options.onSnapshotSynced,
  });

  return {
    notes,
    setNotes,
    ...syncEngine,
  };
}
