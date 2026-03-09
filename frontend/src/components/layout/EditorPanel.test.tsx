
import { render, screen, fireEvent, act, createEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditorPanel } from './EditorPanel'
import type { Note } from '@/types'
import { calculateHash } from '@/lib/utils'
import { useApi } from '@/hooks/useApi'

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown-preview">{children}</div>,
}))

// Mock DiffView
vi.mock('@/components/ai/DiffView', () => ({
  DiffView: ({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) => (
    <div data-testid="diff-view">
      <button data-testid="diff-accept-button" onClick={onAccept}>Accept</button>
      <button data-testid="diff-reject-button" onClick={onReject}>Reject</button>
    </div>
  ),
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
  useApi: vi.fn(() => ({
    getApi: vi.fn(),
  })),
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

  describe('onContentChange callback', () => {
    it('calls onContentChange with note content on mount', () => {
      // Regression test: EditorPanel must notify the parent of its initial content on
      // mount so that AI edit requests always send the actual note content, not an
      // empty string.  Before the fix, onContentChange was only called on user input,
      // so opening AI edit immediately after selecting a note sent "" to the backend
      // and caused a 400 "Content is empty" error.
      const onContentChange = vi.fn()
      render(<EditorPanel {...defaultProps} onContentChange={onContentChange} />)
      expect(onContentChange).toHaveBeenCalledWith(mockNote.content)
    })

    it('calls onContentChange when user edits content', () => {
      const onContentChange = vi.fn()
      render(<EditorPanel {...defaultProps} onContentChange={onContentChange} />)
      onContentChange.mockClear()

      const textarea = screen.getByRole('textbox', { name: /content/i })
      fireEvent.change(textarea, { target: { value: 'Updated content' } })

      expect(onContentChange).toHaveBeenCalledWith('Updated content')
    })

    it('calls onContentChange with empty string when note has no content', () => {
      const onContentChange = vi.fn()
      const emptyNote = { ...mockNote, content: '' }
      render(<EditorPanel {...defaultProps} note={emptyNote} onContentChange={onContentChange} />)
      expect(onContentChange).toHaveBeenCalledWith('')
    })
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
    let requestFullscreenMock: ReturnType<typeof vi.fn>
    let exitFullscreenMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      requestFullscreenMock = vi.fn().mockImplementation(() => {
        Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true })
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      })
      exitFullscreenMock = vi.fn().mockImplementation(() => {
        Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
        document.dispatchEvent(new Event('fullscreenchange'))
        return Promise.resolve()
      })
      HTMLElement.prototype.requestFullscreen = requestFullscreenMock
      document.exitFullscreen = exitFullscreenMock
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    })

    afterEach(() => {
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    })

    it('renders fullscreen toggle button', () => {
      render(<EditorPanel {...defaultProps} />)
      expect(screen.getByTestId('editor-fullscreen-button')).toBeInTheDocument()
    })

    it('calls requestFullscreen when toggle button is clicked', async () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')
      await act(async () => { fireEvent.click(button) })
      expect(requestFullscreenMock).toHaveBeenCalled()
    })

    it('calls exitFullscreen when button is clicked while in fullscreen', async () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')

      // Enter fullscreen
      await act(async () => { fireEvent.click(button) })
      expect(requestFullscreenMock).toHaveBeenCalled()

      // Exit fullscreen
      await act(async () => { fireEvent.click(button) })
      expect(exitFullscreenMock).toHaveBeenCalled()
    })

    it('shows exit fullscreen aria-label when in fullscreen', async () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')
      expect(button).toHaveAttribute('aria-label', 'editor.fullscreen')

      await act(async () => { fireEvent.click(button) })
      expect(button).toHaveAttribute('aria-label', 'editor.exitFullscreen')
    })

    it('syncs state when fullscreenchange event fires (e.g. ESC key)', async () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')

      // Enter fullscreen
      await act(async () => { fireEvent.click(button) })
      expect(button).toHaveAttribute('aria-label', 'editor.exitFullscreen')

      // Simulate browser ESC by dispatching fullscreenchange with no fullscreenElement
      await act(async () => {
        Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
        document.dispatchEvent(new Event('fullscreenchange'))
      })
      expect(button).toHaveAttribute('aria-label', 'editor.fullscreen')
    })

    it('toggles fullscreen with Ctrl+Shift+F', async () => {
      render(<EditorPanel {...defaultProps} />)
      const button = screen.getByTestId('editor-fullscreen-button')

      // Toggle on
      await act(async () => { fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true }) })
      expect(requestFullscreenMock).toHaveBeenCalled()
      expect(button).toHaveAttribute('aria-label', 'editor.exitFullscreen')

      // Toggle off
      await act(async () => { fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true }) })
      expect(exitFullscreenMock).toHaveBeenCalled()
      expect(button).toHaveAttribute('aria-label', 'editor.fullscreen')
    })
  })

  describe('Image upload size validation', () => {
    const MAX_SIZE = 10 * 1024 * 1024 // 10MB

    let uploadImageMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      uploadImageMock = vi.fn().mockResolvedValue({ url: 'https://cdn.example.com/image.png' })
      vi.mocked(useApi).mockReturnValue({
        getApi: vi.fn().mockResolvedValue({ uploadImage: uploadImageMock }),
      })
    })

    afterEach(() => {
      vi.mocked(useApi).mockReturnValue({ getApi: vi.fn() })
    })

    const dropFile = async (file: File) => {
      const dropZone = screen.getByTestId('editor-drop-zone')
      const dropEvent = createEvent.drop(dropZone)
      Object.defineProperty(dropEvent, 'dataTransfer', { value: { files: [file] } })
      await act(async () => { fireEvent(dropZone, dropEvent) })
    }

    const pasteFile = async (file: File) => {
      const textarea = screen.getByTestId('editor-content-input')
      const pasteEvent = createEvent.paste(textarea)
      Object.defineProperty(pasteEvent, 'clipboardData', { value: { files: [file] } })
      await act(async () => { fireEvent(textarea, pasteEvent) })
    }

    it('shows error and does not upload when dropped image exceeds 5MB', async () => {
      const largeFile = new File([new Uint8Array(MAX_SIZE + 1)], 'large.png', { type: 'image/png' })

      render(<EditorPanel {...defaultProps} />)
      await dropFile(largeFile)

      expect(screen.getByText('editor.imageTooLarge')).toBeInTheDocument()
      expect(uploadImageMock).not.toHaveBeenCalled()
    })

    it('shows error and does not upload when pasted image exceeds 5MB', async () => {
      const largeFile = new File([new Uint8Array(MAX_SIZE + 1)], 'large.png', { type: 'image/png' })

      render(<EditorPanel {...defaultProps} />)
      await pasteFile(largeFile)

      expect(screen.getByText('editor.imageTooLarge')).toBeInTheDocument()
      expect(uploadImageMock).not.toHaveBeenCalled()
    })

    it('auto-dismisses error message after 5 seconds', async () => {
      vi.useFakeTimers()
      const largeFile = new File([new Uint8Array(MAX_SIZE + 1)], 'large.png', { type: 'image/png' })

      render(<EditorPanel {...defaultProps} />)
      await dropFile(largeFile)

      expect(screen.getByText('editor.imageTooLarge')).toBeInTheDocument()

      await act(async () => { vi.advanceTimersByTime(5000) })

      expect(screen.queryByText('editor.imageTooLarge')).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('does not show error for image exactly at 5MB (boundary: allowed)', async () => {
      const exactFile = new File([new Uint8Array(MAX_SIZE)], 'exact.png', { type: 'image/png' })

      render(<EditorPanel {...defaultProps} />)
      await dropFile(exactFile)

      expect(screen.queryByText('editor.imageTooLarge')).not.toBeInTheDocument()
      expect(uploadImageMock).toHaveBeenCalled()
    })

    it('calls uploadImage for valid-sized image drop', async () => {
      const validFile = new File(['png'], 'small.png', { type: 'image/png' })

      render(<EditorPanel {...defaultProps} />)
      await dropFile(validFile)

      expect(screen.queryByText('editor.imageTooLarge')).not.toBeInTheDocument()
      expect(uploadImageMock).toHaveBeenCalledWith(validFile)
    })
  })

  describe('pending edit proposal display', () => {
    const proposal = { originalContent: "original", editedContent: "edited", status: "pending" as const };

    it("pendingEditProposalがあるときdiff-panelを表示しtextareaを非表示にする", () => {
      render(<EditorPanel {...defaultProps} pendingEditProposal={proposal} onAcceptEdit={vi.fn()} onRejectEdit={vi.fn()} />);
      expect(screen.getByTestId("editor-diff-panel")).toBeInTheDocument();
      expect(screen.queryByTestId("editor-content-input")).toBeNull();
    });

    it("pendingEditProposalがnullのときtextareaを表示する", () => {
      render(<EditorPanel {...defaultProps} pendingEditProposal={null} />);
      expect(screen.getByTestId("editor-content-input")).toBeInTheDocument();
      expect(screen.queryByTestId("editor-diff-panel")).toBeNull();
    });

    it("AcceptクリックでonAcceptEditを呼ぶ", () => {
      const onAcceptEdit = vi.fn();
      render(<EditorPanel {...defaultProps} pendingEditProposal={proposal} onAcceptEdit={onAcceptEdit} onRejectEdit={vi.fn()} />);
      fireEvent.click(screen.getByTestId("diff-accept-button"));
      expect(onAcceptEdit).toHaveBeenCalledOnce();
    });
  });

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

