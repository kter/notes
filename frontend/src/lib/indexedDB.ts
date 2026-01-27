/**
 * IndexedDB wrapper for offline data persistence
 * Stores notes and folders locally in the browser
 */

import type { Note, Folder } from "@/types";

const DB_NAME = "notes-app-db";
const DB_VERSION = 1;

// Store names
const NOTES_STORE = "notes";
const FOLDERS_STORE = "folders";
const SYNC_QUEUE_STORE = "sync-queue";

export type SyncOperationType = "create" | "update" | "delete";

export interface PendingChange {
  id: string;
  type: SyncOperationType;
  entityType: "note" | "folder";
  entityId: string;
  data?: Partial<Note> | Partial<Folder>;
  timestamp: number;
}

class NotesDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase> | null = null;

  async init(): Promise<IDBDatabase> {
    // Return existing promise if initialization is in progress
    if (this.initPromise) {
      return this.initPromise;
    }

    // Return existing db if already initialized
    if (this.db) {
      return this.db;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("Failed to open IndexedDB:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create notes store
        if (!db.objectStoreNames.contains(NOTES_STORE)) {
          const notesStore = db.createObjectStore(NOTES_STORE, { keyPath: "id" });
          notesStore.createIndex("folder_id", "folder_id", { unique: false });
          notesStore.createIndex("updated_at", "updated_at", { unique: false });
        }

        // Create folders store
        if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
          db.createObjectStore(FOLDERS_STORE, { keyPath: "id" });
        }

        // Create sync queue store
        if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
          const syncStore = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: "id" });
          syncStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  // =====================
  // Notes Operations
  // =====================

  async saveNote(note: Note): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(NOTES_STORE, "readwrite");
      const store = transaction.objectStore(NOTES_STORE);
      const request = store.put(note);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveNotes(notes: Note[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(NOTES_STORE, "readwrite");
      const store = transaction.objectStore(NOTES_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      notes.forEach((note) => store.put(note));
    });
  }

  async getNote(id: string): Promise<Note | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(NOTES_STORE, "readonly");
      const store = transaction.objectStore(NOTES_STORE);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getAllNotes(): Promise<Note[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(NOTES_STORE, "readonly");
      const store = transaction.objectStore(NOTES_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteNote(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(NOTES_STORE, "readwrite");
      const store = transaction.objectStore(NOTES_STORE);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // =====================
  // Folders Operations
  // =====================

  async saveFolder(folder: Folder): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FOLDERS_STORE, "readwrite");
      const store = transaction.objectStore(FOLDERS_STORE);
      const request = store.put(folder);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveFolders(folders: Folder[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FOLDERS_STORE, "readwrite");
      const store = transaction.objectStore(FOLDERS_STORE);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      folders.forEach((folder) => store.put(folder));
    });
  }

  async getAllFolders(): Promise<Folder[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FOLDERS_STORE, "readonly");
      const store = transaction.objectStore(FOLDERS_STORE);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async deleteFolder(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(FOLDERS_STORE, "readwrite");
      const store = transaction.objectStore(FOLDERS_STORE);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // =====================
  // Sync Queue Operations
  // =====================

  async addPendingChange(change: PendingChange): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_QUEUE_STORE, "readwrite");
      const store = transaction.objectStore(SYNC_QUEUE_STORE);
      const request = store.put(change);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getPendingChanges(): Promise<PendingChange[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_QUEUE_STORE, "readonly");
      const store = transaction.objectStore(SYNC_QUEUE_STORE);
      const index = store.index("timestamp");
      const request = index.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async removePendingChange(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_QUEUE_STORE, "readwrite");
      const store = transaction.objectStore(SYNC_QUEUE_STORE);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearPendingChanges(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_QUEUE_STORE, "readwrite");
      const store = transaction.objectStore(SYNC_QUEUE_STORE);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // =====================
  // Utility Methods
  // =====================

  async clearAll(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [NOTES_STORE, FOLDERS_STORE, SYNC_QUEUE_STORE],
        "readwrite"
      );

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      transaction.objectStore(NOTES_STORE).clear();
      transaction.objectStore(FOLDERS_STORE).clear();
      transaction.objectStore(SYNC_QUEUE_STORE).clear();
    });
  }
}

// Singleton instance
export const notesDB = new NotesDB();
