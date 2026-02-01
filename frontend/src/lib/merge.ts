import { Note, Folder } from "@/types";

/**
 * Merges local and server notes based on updated_at timestamp (Last Write Wins).
 * 
 * Strategy:
 * 1. Create a map of all notes by ID.
 * 2. If a note exists in both local and server, pick the one with the later updated_at.
 * 3. If a note exists only in server, keep it.
 * 4. If a note exists only in local:
 *    - If it's a temp note (starts with "temp-"), keep it.
 *    - If it's a regular note (was previously synced but now missing from server),
 *      we assume it was deleted on server. However, if the local version is *newer* 
 *      than the last known sync, it might be a pending offline delete or edit.
 *      BUT, for the specific "load" context, usually server source of truth implies 
 *      deletion unless we track "deleted" state explicitly.
 *      
 *      Currently, useHomeData fetches fresh from server. If server doesn't have it, 
 *      it's gone.
 *      
 *      EXCEPTION: If we are just starting up, "local" might have pending creations.
 *      But pending creations usually have "temp-" IDs.
 *      
 *      So, for stable IDs:
 *      - Server missing, Local present -> Likely deleted on server -> Remove from result.
 *      
 *      Wait, if I edited a note offline, it still has a stable ID.
 *      If I come online, `listNotes` won't return it? 
 *      No, `listNotes` returns what the server has. 
 *      If I edited it locally, it SHOULD be on the server (unless I created it offline).
 *      
 *      If I edited an existing note offline:
 *      Local: ID=1, v2
 *      Server: ID=1, v1
 *      Result: ID=1, v2 (because local is newer)
 *      
 *      If I deleted a note offline:
 *      Local: (Gone from local notes list, but maybe in pending queue? No, useHomeData 
 *      gets "localNotes" from IndexedDB).
 *      
 *      Let's stick to the requested "Last Write Wins" for conflicts.
 *      
 *      For existence:
 *      - If in Server, usually keep (unless local explicitly deleted it? We don't track tombstones here).
 *      - If in Local only (and not temp):
 *        - This is the tricky case. If another device deleted it, server says gone.
 *        - If we just haven't synced it yet? (Unlikely for creation, as that would be temp ID).
 *        - So assume Server is truth for *existence* of non-temp IDs.
 */
export function mergeNotes(localNotes: Note[], serverNotes: Note[]): Note[] {
  const mergedMap = new Map<string, Note>();

  // 1. Add all Server notes first (Server is baseline)
  for (const note of serverNotes) {
    mergedMap.set(note.id, note);
  }

  // 2. Merge Local notes
  for (const localNote of localNotes) {
    // Case A: Temp note (created offline, not yet synced)
    if (localNote.id.startsWith("temp-")) {
      // Only add if not already present (unlikely to collide with server IDs)
      if (!mergedMap.has(localNote.id)) {
        mergedMap.set(localNote.id, localNote);
      }
      continue;
    }

    // Case B: Existing note conflict
    if (mergedMap.has(localNote.id)) {
      const serverNote = mergedMap.get(localNote.id)!;
      const localTime = new Date(localNote.updated_at).getTime();
      const serverTime = new Date(serverNote.updated_at).getTime();

      // If local is strictly newer, use local
      if (localTime > serverTime) {
        mergedMap.set(localNote.id, localNote);
      }
      // Else keep server (server wins ties)
    } 
    // Case C: Note exists locally but NOT on server
    else {
      // If it's a real ID but missing from server, it means it was deleted on server.
      // We generally accept server deletion.
      // However, if we strongly believe local has unsynced changes that *restored* it?
      // Without tombstones, safer to assume server deletion propagates.
      // User complaint was about "overwriting local changes", which usually implies Case B.
      
      // We do NOT add it.
    }
  }

  return Array.from(mergedMap.values());
}

/**
 * Merges local and server folders based on updated_at timestamp.
 */
export function mergeFolders(localFolders: Folder[], serverFolders: Folder[]): Folder[] {
  const mergedMap = new Map<string, Folder>();

  for (const folder of serverFolders) {
    mergedMap.set(folder.id, folder);
  }

  for (const localFolder of localFolders) {
    if (localFolder.id.startsWith("temp-")) {
      if (!mergedMap.has(localFolder.id)) {
        mergedMap.set(localFolder.id, localFolder);
      }
      continue;
    }

    if (mergedMap.has(localFolder.id)) {
      const serverFolder = mergedMap.get(localFolder.id)!;
      const localTime = new Date(localFolder.updated_at).getTime();
      const serverTime = new Date(serverFolder.updated_at).getTime();

      if (localTime > serverTime) {
        mergedMap.set(localFolder.id, localFolder);
      }
    }
  }

  return Array.from(mergedMap.values());
}
