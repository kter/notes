/**
 * オフラインデータ永続化のための IndexedDB ラッパー。
 * ノート・フォルダ・同期キューをブラウザのローカルストレージに保存・管理する。
 *
 * 主なエクスポート:
 * - notesDB: NotesDB クラスのシングルトンインスタンス
 * - PendingChange: 未同期変更の型定義
 * - SyncOperationType: create / update / delete の操作種別
 *
 * 呼び出し関係: syncQueue、workspaceSync、useNoteSyncEngine から使用される。
 */

import type { Note, Folder } from "@/types";
import { logger } from "@/lib/logger";

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
  expectedVersion?: number;
  timestamp: number;
}

/**
 * IndexedDB を抽象化した内部クラス。
 * ノート・フォルダ・同期キューの各ストアに対する CRUD 操作を提供する。
 */
class NotesDB {
  private db: IDBDatabase | null = null;
  // 初期化の重複呼び出しを防ぐための Promise キャッシュ
  private initPromise: Promise<IDBDatabase> | null = null;

  /**
   * IndexedDB を開き、必要なオブジェクトストアを作成して返す。
   * 複数箇所から同時に呼ばれた場合、同一 Promise を返して二重初期化を防ぐ。
   */
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
        logger.error("Failed to open IndexedDB", request.error);
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

  /**
   * 初期化済みの DB インスタンスを返す。未初期化なら init() を呼び出す。
   */
  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  // =====================
  // Notes Operations
  // =====================

  /** ノートを IndexedDB に保存または上書きする。 */
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

  /** 複数ノートを単一トランザクションで一括保存する。 */
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

  /** 指定 ID のノートを取得する。存在しない場合は undefined を返す。 */
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

  /** ストア内の全ノートを取得して返す。 */
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

  /**
   * 既存ノートの content フィールドのみを更新して保存する。
   * 対象ノートが存在しない場合は何もしない。
   */
  async saveNoteBody(id: string, content: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(NOTES_STORE, "readwrite");
      const store = transaction.objectStore(NOTES_STORE);
      const getRequest = store.get(id);

      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const note: Note | undefined = getRequest.result;
        if (!note) {
          resolve();
          return;
        }
        const putRequest = store.put({ ...note, content });
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      };
    });
  }

  /** 指定 ID のノートを IndexedDB から削除する。 */
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

  /** フォルダを IndexedDB に保存または上書きする。 */
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

  /** 複数フォルダを単一トランザクションで一括保存する。 */
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

  /** ストア内の全フォルダを取得して返す。 */
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

  /** 指定 ID のフォルダを IndexedDB から削除する。 */
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

  /** 未同期変更をキューに追加する。同一 ID のレコードがあれば上書きする。 */
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

  /** timestamp インデックス順に全未同期変更を取得して返す。 */
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

  /** 指定 ID の未同期変更をキューから削除する。 */
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

  /** 同期キューを全件クリアする。 */
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

  /** ノート・フォルダ・同期キューの全ストアを単一トランザクションでクリアする。 */
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
