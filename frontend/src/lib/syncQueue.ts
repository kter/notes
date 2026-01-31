/**
 * Sync Queue Manager
 * Manages pending changes for offline sync
 */

import { notesDB, type PendingChange, type SyncOperationType } from "./indexedDB";
import { ApiError } from "./api"; // Import ApiError
import type { Note, NoteCreate, NoteUpdate } from "@/types";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  errors: Error[];
}

type ApiClient = {
  createNote: (data: NoteCreate) => Promise<Note>;
  updateNote: (id: string, data: NoteUpdate) => Promise<Note>;
  deleteNote: (id: string) => Promise<void>;
};

class SyncQueueManager {
  private isSyncing = false;

  /**
   * Generate a unique ID for pending changes
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Add a pending change to the queue
   */
  async addChange(
    type: SyncOperationType,
    entityType: "note" | "folder",
    entityId: string,
    data?: Partial<Note>
  ): Promise<void> {
    const change: PendingChange = {
      id: this.generateId(),
      type,
      entityType,
      entityId,
      data,
      timestamp: Date.now(),
    };

    // Optimize: If there's already a pending change for this entity, merge or replace
    const existingChanges = await notesDB.getPendingChanges();
    const existingIndex = existingChanges.findIndex(
      (c) => c.entityType === entityType && c.entityId === entityId
    );

    if (existingIndex !== -1) {
      const existing = existingChanges[existingIndex];

      // If the entity was created and now being updated, keep as create with new data
      if (existing.type === "create" && type === "update") {
        await notesDB.removePendingChange(existing.id);
        change.type = "create";
        change.data = { ...existing.data, ...data };
      }
      // If the entity was created and now being deleted, just remove both
      else if (existing.type === "create" && type === "delete") {
        await notesDB.removePendingChange(existing.id);
        return; // No need to sync anything
      }
      // If update followed by update, merge
      else if (existing.type === "update" && type === "update") {
        await notesDB.removePendingChange(existing.id);
        change.data = { ...existing.data, ...data };
      }
      // If update followed by delete, just keep delete
      else if (existing.type === "update" && type === "delete") {
        await notesDB.removePendingChange(existing.id);
        // change is already a delete, proceed normally
      }
    }

    await notesDB.addPendingChange(change);
  }

  /**
   * Get all pending changes
   */
  async getPendingChanges(): Promise<PendingChange[]> {
    return notesDB.getPendingChanges();
  }

  /**
   * Get count of pending changes
   */
  async getPendingCount(): Promise<number> {
    const changes = await notesDB.getPendingChanges();
    return changes.length;
  }

  /**
   * Process all pending changes
   */
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

      for (const change of changes) {
        try {
          await this.processSingleChange(change, apiClient);
          await notesDB.removePendingChange(change.id);
          result.syncedCount++;
        } catch (error) {
          // Check if it's a permanent error (4xx client error, excluding 429 Too Many Requests)
          // We also exclude 401/403 as they might be fixable with a fresh login/token refresh
          // although typically 401s should trigger a logout.
          let isPermanentError = false;

          if (error instanceof ApiError) {
             const status = error.status;
             // 400-499 are client errors. 
             // Exclude 429 (Too Many Requests) -> Retry
             // Exclude 408 (Request Timeout) -> Retry
             if (status >= 400 && status < 500 && status !== 429 && status !== 408) {
               isPermanentError = true;
             }
          }

          if (isPermanentError) {
            console.error(`Permanent sync error for change ${change.id}. Removing from queue.`, error);
            // Remove the "poisoned" item so it doesn't block the queue or cause persistent error state
            await notesDB.removePendingChange(change.id);
            
            // We count this as "processed" but maybe with a warning? 
            // For now, let's NOT increment failedCount so the UI doesn't show "Error" state perpetually
            // for an item that is effectively gone.
            // OR: We can increment syncedCount? No, that's misleading.
            // We just don't add to failedCount.
          } else {
            console.error(`Transient sync error for change ${change.id}. Keeping in queue.`, error);
            result.failedCount++;
            result.errors.push(error instanceof Error ? error : new Error(String(error)));
            result.success = false;
          }
          // Continue processing other changes
        }
      }
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  /**
   * Process a single pending change
   */
  private async processSingleChange(
    change: PendingChange,
    apiClient: ApiClient
  ): Promise<void> {
    if (change.entityType !== "note") {
      // For now, only handle notes. Folders can be added later.
      console.warn("Folder sync not implemented yet");
      return;
    }

    switch (change.type) {
      case "create":
        await apiClient.createNote(change.data as NoteCreate);
        break;
      case "update":
        await apiClient.updateNote(change.entityId, change.data as NoteUpdate);
        break;
      case "delete":
        await apiClient.deleteNote(change.entityId);
        break;
    }
  }

  /**
   * Clear all pending changes
   */
  async clearQueue(): Promise<void> {
    await notesDB.clearPendingChanges();
  }

  /**
   * Check if currently syncing
   */
  get syncing(): boolean {
    return this.isSyncing;
  }
}

// Singleton instance
export const syncQueue = new SyncQueueManager();
