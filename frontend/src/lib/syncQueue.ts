/**
 * Sync Queue Manager
 * Manages pending changes for offline sync.
 */

import { notesDB, type PendingChange, type SyncOperationType } from "./indexedDB";
import { ApiError } from "./api";
import {
  getWorkspaceSyncRequestMetadata,
  persistWorkspaceSnapshot,
  isConflictApiError,
  refreshWorkspaceSnapshot,
} from "./workspaceSync";
import type {
  Folder,
  Note,
  WorkspaceChangeRequest,
  WorkspaceChangesResponse,
} from "@/types";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: Error[];
  snapshot?: WorkspaceChangesResponse["snapshot"];
  errorCode?: "conflict";
}

type ApiClient = {
  applyWorkspaceChanges: (request: {
    device_id?: string;
    base_cursor?: string;
    changes: WorkspaceChangeRequest[];
  }) => Promise<WorkspaceChangesResponse>;
  getWorkspaceSnapshot: () => Promise<WorkspaceChangesResponse["snapshot"]>;
};

class SyncQueueManager {
  private isSyncing = false;

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  async addChange(
    type: SyncOperationType,
    entityType: "note" | "folder",
    entityId: string,
    data?: Partial<Note> | Partial<Folder>,
    options: { expectedVersion?: number } = {}
  ): Promise<void> {
    const change: PendingChange = {
      id: this.generateId(),
      type,
      entityType,
      entityId,
      data,
      expectedVersion: options.expectedVersion,
      timestamp: Date.now(),
    };

    const existingChanges = await notesDB.getPendingChanges();
    const existingIndex = existingChanges.findIndex(
      (candidate) =>
        candidate.entityType === entityType && candidate.entityId === entityId
    );

    if (existingIndex !== -1) {
      const existing = existingChanges[existingIndex];

      if (existing.type === "create" && type === "update") {
        await notesDB.removePendingChange(existing.id);
        change.type = "create";
        change.data = { ...existing.data, ...data };
      } else if (existing.type === "create" && type === "delete") {
        await notesDB.removePendingChange(existing.id);
        return;
      } else if (existing.type === "update" && type === "update") {
        await notesDB.removePendingChange(existing.id);
        change.data = { ...existing.data, ...data };
        change.expectedVersion = existing.expectedVersion;
      } else if (existing.type === "update" && type === "delete") {
        await notesDB.removePendingChange(existing.id);
        change.expectedVersion = existing.expectedVersion;
      }
    }

    await notesDB.addPendingChange(change);
  }

  async getPendingChanges(): Promise<PendingChange[]> {
    return notesDB.getPendingChanges();
  }

  async getPendingCount(): Promise<number> {
    const changes = await notesDB.getPendingChanges();
    return changes.length;
  }

  async processQueue(apiClient: ApiClient): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, syncedCount: 0, failedCount: 0, errors: [] };
    }

    this.isSyncing = true;
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
    };

    try {
      const changes = await notesDB.getPendingChanges();
      if (changes.length === 0) {
        return result;
      }

      try {
        const response = await apiClient.applyWorkspaceChanges({
          ...getWorkspaceSyncRequestMetadata(),
          changes: changes.map((change) => this.toWorkspaceChangeRequest(change)),
        });

        await this.persistSuccessfulSync(changes, response);
        result.syncedCount = changes.length;
        result.snapshot = response.snapshot;
      } catch (error) {
        if (isConflictApiError(error)) {
          const snapshot = await refreshWorkspaceSnapshot(apiClient);
          for (const change of changes) {
            await notesDB.removePendingChange(change.id);
          }
          result.snapshot = snapshot;
          result.errorCode = "conflict";
          result.success = false;
        } else if (this.isPermanentError(error)) {
          for (const change of changes) {
            await notesDB.removePendingChange(change.id);
          }
        } else {
          result.failedCount = changes.length;
          result.errors.push(error instanceof Error ? error : new Error(String(error)));
          result.success = false;
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  async clearQueue(): Promise<void> {
    await notesDB.clearPendingChanges();
  }

  get syncing(): boolean {
    return this.isSyncing;
  }

  private toWorkspaceChangeRequest(change: PendingChange): WorkspaceChangeRequest {
    return {
      entity: change.entityType,
      operation: change.type,
      entity_id: change.type === "create" ? undefined : change.entityId,
      client_mutation_id: change.id,
      expected_version: change.expectedVersion,
      payload: change.type === "delete" ? undefined : change.data,
    };
  }

  private async persistSuccessfulSync(
    changes: PendingChange[],
    response: WorkspaceChangesResponse
  ): Promise<void> {
    for (const change of changes) {
      if (change.type === "create" && change.entityId.startsWith("temp-")) {
        if (change.entityType === "note") {
          await notesDB.deleteNote(change.entityId);
        } else {
          await notesDB.deleteFolder(change.entityId);
        }
      }
    }

    await persistWorkspaceSnapshot(response.snapshot);

    for (const change of changes) {
      await notesDB.removePendingChange(change.id);
    }
  }

  private isPermanentError(error: unknown): boolean {
    if (!(error instanceof ApiError)) {
      return false;
    }

    const status = error.status;
    return status >= 400 && status < 500 && ![401, 403, 408, 409, 429].includes(status);
  }
}

export const syncQueue = new SyncQueueManager();
