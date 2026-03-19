"use client";

/**
 * Hook for managing offline sync functionality
 * Monitors online/offline status and triggers sync when back online
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { notesDB } from "@/lib/indexedDB";
import { syncQueue, type SyncStatus } from "@/lib/syncQueue";
import { dispatchWorkspaceSynced } from "@/lib/workspaceSync";
import { useTranslation } from "@/hooks/useTranslation";
import { useApi } from "./useApi";
import type { WorkspaceSnapshotResponse } from "@/types";

interface UseOfflineSyncOptions {
  onSnapshotSynced?: (snapshot: WorkspaceSnapshotResponse) => void;
}

interface UseOfflineSyncReturn {
  isOnline: boolean;
  syncStatus: SyncStatus;
  lastErrorMessage: string | null;
  pendingChangesCount: number;
  forceSync: () => Promise<void>;
  lastSyncTime: Date | null;
}

export function useOfflineSync(
  options: UseOfflineSyncOptions = {}
): UseOfflineSyncReturn {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [pendingChangesCount, setPendingChangesCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const { getApi } = useApi();
  const { t } = useTranslation();
  const syncInProgressRef = useRef(false);
  const onSnapshotSynced = options.onSnapshotSynced;

  // Update pending changes count
  const updatePendingCount = useCallback(async () => {
    try {
      const count = await syncQueue.getPendingCount();
      setPendingChangesCount(count);
    } catch (error) {
      console.error("Failed to get pending count:", error);
    }
  }, []);

  // Sync function
  const performSync = useCallback(async () => {
    if (syncInProgressRef.current || !navigator.onLine) {
      return;
    }

    syncInProgressRef.current = true;
    setSyncStatus("syncing");

    try {
      const apiClient = await getApi();
      const result = await syncQueue.processQueue(apiClient);

      if (result.success) {
        if (result.snapshot) {
          if (onSnapshotSynced) {
            onSnapshotSynced(result.snapshot);
          } else {
            dispatchWorkspaceSynced({ snapshot: result.snapshot });
          }
        }
        setSyncStatus("idle");
        setLastErrorMessage(null);
        setLastSyncTime(new Date());
      } else if (result.errorCode === "conflict") {
        if (result.snapshot) {
          if (onSnapshotSynced) {
            onSnapshotSynced(result.snapshot);
          } else {
            dispatchWorkspaceSynced({ snapshot: result.snapshot });
          }
        }
        setSyncStatus("error");
        setLastErrorMessage(t("sync.conflictReloaded"));
      } else if (result.failedCount > 0) {
        setSyncStatus("error");
        setLastErrorMessage(t("sync.serverSyncFailed"));
        console.error("Sync errors:", result.errors);
      }

      await updatePendingCount();
    } catch (error) {
      console.error("Sync failed:", error);
      setSyncStatus("error");
      setLastErrorMessage(t("sync.serverSyncFailed"));
    } finally {
      syncInProgressRef.current = false;
    }
  }, [getApi, onSnapshotSynced, t, updatePendingCount]);

  // Force sync exposed to consumers
  const forceSync = useCallback(async () => {
    if (isOnline) {
      await performSync();
    }
  }, [isOnline, performSync]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus("idle");
      setLastErrorMessage(null);
      // Trigger sync when coming back online
      performSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus("offline");
      setLastErrorMessage(null);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial state check
    setIsOnline(navigator.onLine);
    if (!navigator.onLine) {
      setSyncStatus("offline");
    }

    // Initialize IndexedDB
    notesDB.init().catch(console.error);

    // Initial pending count
    updatePendingCount();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [performSync, updatePendingCount]);

  // Periodically update pending count
  useEffect(() => {
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, [updatePendingCount]);

  return {
    isOnline,
    syncStatus,
    lastErrorMessage,
    pendingChangesCount,
    forceSync,
    lastSyncTime,
  };
}
