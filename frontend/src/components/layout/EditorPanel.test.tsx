
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditorPanel } from './EditorPanel'
import type { Note } from '@/types'
import { calculateHash } from '@/lib/utils'

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown-preview">{children}</div>,
}))

// Mock remark-gfm
vi.mock('remark-gfm', () => ({
  default: () => {},
}))

// Mock useTranslation
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock useApi
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({
    getApi: vi.fn(),
  }),
}))

// Mock Clock to avoid interval timers
vi.mock('@/components/Clock', () => ({
  Clock: () => <div data-testid="clock">Clock</div>,
}))

// Mock calculateHash to control timing in debounce tests
vi.mock('@/lib/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
  calculateHash: vi.fn().mockResolvedValue('mockhash'),
}))

describe('EditorPanel', () => {
    const mockNote: Note = {
        id: '1',
        title: 'Initial content',
        content: 'Initial content',
        user_id: 'u1',
        folder_id: null,
        created_at: '',
        updated_at: ''
    }

  const defaultProps = {
    note: mockNote,
    folders: [],
    onUpdateNote: vi.fn(),
    onDeleteNote: vi.fn(),
    onSummarize: vi.fn(),
    onOpenChat: vi.fn(),
    triggerServerSync: vi.fn(),
    isChatOpen: false,
    syncStatus: {
        local: 'saved',
        remote: 'synced',
        isSaving: false
    } as const
  } 

  it('renders with initial content', () => {
    render(<EditorPanel {...defaultProps} />)
    
    const textarea = screen.getByRole('textbox', { name: /content/i }) as HTMLTextAreaElement
    expect(textarea.value).toBe('Initial content')
  })

  it('calls onUpdateNote when typing', () => {
    // Note: The component uses handleContentChange -> setContent (local state) -> useEffect (debounce) -> onUpdateNote
    // Because of debounce, we might not see immediate call unless we fast-forward timers.
    // However, the component ALSO calls onUpdateNote in onBlur.
    
    vi.useFakeTimers()
    render(<EditorPanel {...defaultProps} />)
    
    const textarea = screen.getByRole('textbox', { name: /content/i })
    fireEvent.change(textarea, { target: { value: 'New content' } })
    
    // Fast forward debounce
    vi.runAllTimers()
    
    expect(defaultProps.onUpdateNote).toHaveBeenCalledWith('1', { title: 'Initial content', content: 'New content' })
    vi.useRealTimers()
  })

  it('displays saving status', () => {
    const props = {
        ...defaultProps,
        syncStatus: { ...defaultProps.syncStatus, isSaving: true, remote: 'syncing' as const }
    }
    render(<EditorPanel {...props} />)
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })

  it('displays unsaved status', () => {
     // Strictly mismatch logic relies on savedHash vs calculated hash.
     // Loosely mismatch relies on remoteStatus === 'unsynced'.
     const props = {
        ...defaultProps,
        syncStatus: { ...defaultProps.syncStatus, remote: 'unsynced' as const }
    }
    render(<EditorPanel {...props} />)
    expect(screen.getByText('editor.unsaved')).toBeInTheDocument()
  })

  it('renders markdown preview when toggle is clicked', () => {
    // Verify preview toggle works correctly
    // The actual useDeferredValue optimization is tested via code review
    render(<EditorPanel {...defaultProps} />)

    // Click preview toggle
    const previewButton = screen.getByTestId('editor-preview-toggle')
    fireEvent.click(previewButton)

    // Preview should be visible with the content
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
  })

  describe('Fullscreen mode', () => {
    it('renders fullscreen toggle button', () => {
      render(<EditorPanel {...defaultProps} />)
      expect(screen.getByTestId('editor-fullscreen-button')).toBeInTheDocument()
    })

    it('enters fullscreen when toggle button is clicked', () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')
      fireEvent.click(button)
      // In fullscreen mode, the outer container has fixed positioning
      const container = button.closest('[class*="fixed"]')
      expect(container).toBeInTheDocument()
    })

    it('exits fullscreen when toggle button is clicked again', () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')

      // Enter fullscreen
      fireEvent.click(button)
      expect(button.closest('[class*="fixed"]')).toBeInTheDocument()

      // Exit fullscreen
      fireEvent.click(button)
      expect(button.closest('[class*="fixed"]')).not.toBeInTheDocument()
    })

    it('shows exit fullscreen aria-label when in fullscreen', () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')
      expect(button).toHaveAttribute('aria-label', 'editor.fullscreen')

      fireEvent.click(button)
      expect(button).toHaveAttribute('aria-label', 'editor.exitFullscreen')
    })

    it('exits fullscreen when Escape key is pressed', () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')

      // Enter fullscreen first
      fireEvent.click(button)
      expect(button.closest('[class*="fixed"]')).toBeInTheDocument()

      // Press Escape to exit
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(button.closest('[class*="fixed"]')).not.toBeInTheDocument()
    })

    it('Escape key has no effect when not in fullscreen', () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')

      // Ensure we are not in fullscreen
      expect(button.closest('[class*="fixed"]')).not.toBeInTheDocument()

      // Pressing Escape should not change anything
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(button.closest('[class*="fixed"]')).not.toBeInTheDocument()
    })

    it('toggles fullscreen with Ctrl+Shift+F', () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')

      // Toggle on
      fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true })
      expect(button.closest('[class*="fixed"]')).toBeInTheDocument()

      // Toggle off
      fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true })
      expect(button.closest('[class*="fixed"]')).not.toBeInTheDocument()
    })

    it('sets body overflow to hidden when fullscreen is active', () => {
      render(<EditorPanel {...defaultProps} />)
      expect(document.body.style.overflow).toBe('')

      fireEvent.click(screen.getByTestId('editor-fullscreen-button'))
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('restores body overflow when exiting fullscreen', () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')

      fireEvent.click(button)
      expect(document.body.style.overflow).toBe('hidden')

      fireEvent.click(button)
      expect(document.body.style.overflow).toBe('')
    })

    it('restores body overflow on unmount', () => {
      const { unmount } = render(<EditorPanel {...defaultProps} />)

      fireEvent.click(screen.getByTestId('editor-fullscreen-button'))
      expect(document.body.style.overflow).toBe('hidden')

      unmount()
      expect(document.body.style.overflow).toBe('')
    })
  })

  describe('Performance optimizations', () => {
    const mockCalculateHash = vi.mocked(calculateHash)

    beforeEach(() => {
      mockCalculateHash.mockClear()
    })

    describe('Hash calculation debounce (500ms)', () => {
      afterEach(() => {
        vi.useRealTimers()
      })

      it('does not calculate hash before 500ms have elapsed', () => {
        vi.useFakeTimers()
        render(<EditorPanel {...defaultProps} />)
        mockCalculateHash.mockClear() // clear the initial mount call

        const textarea = screen.getByRole('textbox', { name: /content/i })
        fireEvent.change(textarea, { target: { value: 'New content' } })

        vi.advanceTimersByTime(499)
        expect(mockCalculateHash).not.toHaveBeenCalled()
      })

      it('calculates hash after 500ms have elapsed', () => {
        vi.useFakeTimers()
        render(<EditorPanel {...defaultProps} />)
        mockCalculateHash.mockClear()

        const textarea = screen.getByRole('textbox', { name: /content/i })
        fireEvent.change(textarea, { target: { value: 'New content' } })

        vi.advanceTimersByTime(500)
        expect(mockCalculateHash).toHaveBeenCalledWith('New content')
      })

      it('resets debounce timer on rapid typing (only calculates once)', () => {
        vi.useFakeTimers()
        render(<EditorPanel {...defaultProps} />)
        mockCalculateHash.mockClear()

        const textarea = screen.getByRole('textbox', { name: /content/i })

        // Simulate rapid typing: 3 keystrokes within 500ms
        fireEvent.change(textarea, { target: { value: 'a' } })
        vi.advanceTimersByTime(200)
        fireEvent.change(textarea, { target: { value: 'ab' } })
        vi.advanceTimersByTime(200)
        fireEvent.change(textarea, { target: { value: 'abc' } })

        // 400ms elapsed since last change — not yet triggered
        vi.advanceTimersByTime(499)
        expect(mockCalculateHash).not.toHaveBeenCalled()

        // 500ms after last change — triggered once with final value
        vi.advanceTimersByTime(1)
        expect(mockCalculateHash).toHaveBeenCalledTimes(1)
        expect(mockCalculateHash).toHaveBeenCalledWith('abc')
      })
    })

    describe('Scroll RAF throttling', () => {
      let originalRaf: typeof requestAnimationFrame
      let originalCaf: typeof cancelAnimationFrame

      beforeEach(() => {
        originalRaf = window.requestAnimationFrame
        originalCaf = window.cancelAnimationFrame
      })

      afterEach(() => {
        window.requestAnimationFrame = originalRaf
        window.cancelAnimationFrame = originalCaf
      })

      it('throttles rapid editor scroll events to one RAF per frame', () => {
        const mockRaf = vi.fn().mockReturnValue(1)
        window.requestAnimationFrame = mockRaf

        render(<EditorPanel {...defaultProps} />)

        // Open preview to enable scroll sync
        const previewButton = screen.getByTestId('editor-preview-toggle')
        fireEvent.click(previewButton)

        const textarea = screen.getByRole('textbox', { name: /content/i })

        // Fire multiple scroll events in the same frame
        fireEvent.scroll(textarea)
        fireEvent.scroll(textarea)
        fireEvent.scroll(textarea)

        // Only one RAF should be scheduled (subsequent events are blocked by the ref guard)
        expect(mockRaf).toHaveBeenCalledTimes(1)
      })

      it('allows a new RAF after previous frame completes', () => {
        vi.useFakeTimers()

        let rafCallback: FrameRequestCallback | null = null
        const mockRaf = vi.fn().mockImplementation((cb: FrameRequestCallback) => {
          rafCallback = cb
          return 1
        })
        window.requestAnimationFrame = mockRaf

        render(<EditorPanel {...defaultProps} />)

        const previewButton = screen.getByTestId('editor-preview-toggle')
        fireEvent.click(previewButton)

        const textarea = screen.getByRole('textbox', { name: /content/i })

        // First scroll — schedules RAF
        fireEvent.scroll(textarea)
        expect(mockRaf).toHaveBeenCalledTimes(1)

        // Execute the RAF callback — clears scrollRafRef.current and sets isScrollingRef.current = true
        act(() => {
          rafCallback?.(0)
        })

        // Advance past the 50ms timeout inside the RAF callback that resets isScrollingRef
        vi.advanceTimersByTime(50)

        // Second scroll after frame + cooldown — should schedule a new RAF
        fireEvent.scroll(textarea)
        expect(mockRaf).toHaveBeenCalledTimes(2)

        vi.useRealTimers()
      })

      it('cancels pending RAF on unmount to prevent stale callbacks', () => {
        const pendingRafId = 42
        const mockRaf = vi.fn().mockReturnValue(pendingRafId)
        const mockCaf = vi.fn()
        window.requestAnimationFrame = mockRaf
        window.cancelAnimationFrame = mockCaf

        const { unmount } = render(<EditorPanel {...defaultProps} />)

        // Open preview and trigger a scroll to schedule a RAF
        const previewButton = screen.getByTestId('editor-preview-toggle')
        fireEvent.click(previewButton)

        const textarea = screen.getByRole('textbox', { name: /content/i })
        fireEvent.scroll(textarea)

        // RAF is pending (callback not yet executed)
        expect(mockRaf).toHaveBeenCalled()

        // Unmount should cancel the pending RAF
        unmount()
        expect(mockCaf).toHaveBeenCalledWith(pendingRafId)
      })

      it('does not cancel RAF on unmount when no scroll was pending', () => {
        const mockCaf = vi.fn()
        window.cancelAnimationFrame = mockCaf

        const { unmount } = render(<EditorPanel {...defaultProps} />)

        // Unmount without triggering any scroll
        unmount()
        expect(mockCaf).not.toHaveBeenCalled()
      })
    })
  })
})

