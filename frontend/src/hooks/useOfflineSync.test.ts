
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
})
