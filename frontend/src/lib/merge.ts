import type { Folder, Note } from "@/types";

function isTempEntity(id: string): boolean {
  return id.startsWith("temp-");
}

function isDeletedEntity<T extends { deleted_at: string | null }>(entity: T): boolean {
  return entity.deleted_at !== null;
}

function isLocalEntityNewer<T extends { version: number; updated_at: string }>(
  localEntity: T,
  serverEntity: T
): boolean {
  if (localEntity.version !== serverEntity.version) {
    return localEntity.version > serverEntity.version;
  }

  return (
    new Date(localEntity.updated_at).getTime() >
    new Date(serverEntity.updated_at).getTime()
  );
}

function mergeWorkspaceEntities<T extends {
  id: string;
  version: number;
  updated_at: string;
  deleted_at: string | null;
}>(localEntities: T[], serverEntities: T[]): T[] {
  const mergedMap = new Map<string, T>();

  for (const serverEntity of serverEntities) {
    if (!isDeletedEntity(serverEntity)) {
      mergedMap.set(serverEntity.id, serverEntity);
    }
  }

  for (const localEntity of localEntities) {
    if (isDeletedEntity(localEntity)) {
      continue;
    }

    if (isTempEntity(localEntity.id)) {
      if (!mergedMap.has(localEntity.id)) {
        mergedMap.set(localEntity.id, localEntity);
      }
      continue;
    }

    const serverEntity = serverEntities.find((entity) => entity.id === localEntity.id);

    if (serverEntity && !isDeletedEntity(serverEntity)) {
      if (isLocalEntityNewer(localEntity, serverEntity)) {
        mergedMap.set(localEntity.id, localEntity);
      }
      continue;
    }
  }

  return Array.from(mergedMap.values());
}

export function mergeNotes(localNotes: Note[], serverNotes: Note[]): Note[] {
  return mergeWorkspaceEntities(localNotes, serverNotes);
}

export function mergeFolders(localFolders: Folder[], serverFolders: Folder[]): Folder[] {
  return mergeWorkspaceEntities(localFolders, serverFolders);
}
