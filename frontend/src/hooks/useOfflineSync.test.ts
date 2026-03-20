
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useOfflineSync } from './useOfflineSync'
import { syncQueue } from '@/lib/syncQueue'

// Mock syncQueue singleton
vi.mock('@/lib/syncQueue', () => ({
  syncQueue: {
    processQueue: vi.fn().mockResolvedValue({ success: true, syncedCount: 0, failedCount: 0, errors: [] }),
    getPendingCount: vi.fn().mockResolvedValue(0),
  },
}))

// Mock useApi
vi.mock('./useApi', () => ({
  useApi: () => ({
    getApi: vi.fn(),
  }),
}))

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'sync.conflictReloaded') return 'Conflict reloaded'
      if (key === 'sync.serverSyncFailed') return 'Server sync failed'
      return key
    },
  }),
}))

describe('useOfflineSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock navigator.onLine setter
    Object.defineProperty(window.navigator, 'onLine', {
      writable: true,
      value: true,
    })
  })

  it('initializes as online', () => {
    const { result } = renderHook(() => useOfflineSync())
    expect(result.current.isOnline).toBe(true)
  })

  it('updates state when going offline', () => {
    const { result } = renderHook(() => useOfflineSync())

    act(() => {
      // Simulate offline event
      Object.defineProperty(window.navigator, 'onLine', {
        writable: true,
        value: false,
      })
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current.isOnline).toBe(false)
  })

  it('attempts to process queue when coming online', async () => {
    renderHook(() => useOfflineSync())

    // Go offline first
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', {
        writable: true,
        value: false,
      })
      window.dispatchEvent(new Event('offline'))
    })
    
    // Then come online
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', {
        writable: true,
        value: true,
      })
      window.dispatchEvent(new Event('online'))
    })

    // WaitFor is needed because performSync is async inside the event handler
    await waitFor(() => {
        expect(syncQueue.processQueue).toHaveBeenCalled()
    })
  })

  it('surfaces conflict reload messages', async () => {
    vi.mocked(syncQueue.processQueue).mockResolvedValueOnce({
      success: false,
      syncedCount: 0,
      failedCount: 0,
      errors: [],
      errorCode: 'conflict',
      snapshot: {
        folders: [],
        notes: [],
        cursor: 'cursor-1',
        server_time: '2024-01-01T00:00:00.000Z',
      },
    })

    const { result } = renderHook(() => useOfflineSync())

    await act(async () => {
      await result.current.forceSync()
    })

    expect(result.current.syncStatus).toBe('error')
    expect(result.current.lastErrorMessage).toBe('Conflict reloaded')
  })

  it('calls the provided snapshot callback when sync returns a snapshot', async () => {
    const onSnapshotSynced = vi.fn()
    const snapshot = {
      folders: [],
      notes: [],
      cursor: 'cursor-1',
      server_time: '2024-01-01T00:00:00.000Z',
    }

    vi.mocked(syncQueue.processQueue).mockResolvedValueOnce({
      success: true,
      syncedCount: 1,
      failedCount: 0,
      errors: [],
      snapshot,
    })

    const { result } = renderHook(() => useOfflineSync({ onSnapshotSynced }))

    await act(async () => {
      await result.current.forceSync()
    })

    expect(syncQueue.processQueue).toHaveBeenCalledWith(undefined, {
      onSnapshotSynced,
    })
    expect(onSnapshotSynced).not.toHaveBeenCalled()
  })
})
