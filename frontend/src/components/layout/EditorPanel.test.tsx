
import { render, screen, fireEvent, act, createEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditorPanel } from './EditorPanel'
import type { Note } from '@/types'
import { calculateHash } from '@/lib/utils'
import { useApi } from '@/hooks/useApi'

// Mock react-markdown
vi.mock('react-markdown', () => ({
   
  default: ({ children }: { children: string }) => {
    return <div data-testid="markdown-preview">{children}</div>
  },
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

// Mock MarkdownEditor with a textarea facade so existing tests work unchanged.
vi.mock('@/components/editor/MarkdownEditor', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockMarkdownEditor = React.forwardRef(function MockMarkdownEditor(props: any, ref: any) {
    const { initialValue, onChange, onBlur, onPasteImage, placeholder, className } = props
    const testId = props['data-testid']
    const [value, setValue] = React.useState(initialValue ?? '')
    const scrollDOMRef = React.useRef(null)
    React.useImperativeHandle(ref, () => ({
      getValue: () => value,
      setValue: (newValue: string) => {
        setValue(newValue)
        onChange?.(newValue)
      },
      focus: () => {},
      view: () => scrollDOMRef.current ? {
        scrollDOM: scrollDOMRef.current,
        state: { selection: { main: { from: 0, to: 0 } } },
        dispatch: () => {},
      } : null,
    }), [value, onChange])

    return React.createElement('div',
      { ref: scrollDOMRef, 'data-testid': 'mock-cm-scroller', className }, // eslint-disable-line react-hooks/refs
      React.createElement('textarea', {
        'aria-label': 'Note content',
        'data-testid': testId,
        placeholder,
        value,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onChange: (e: any) => {
          setValue(e.target.value)
          onChange?.(e.target.value)
        },
        onBlur,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPaste: (e: any) => {
          const file = e.clipboardData?.files[0]
          if (file?.type.startsWith('image/')) {
            e.preventDefault()
            onPasteImage?.(file)
          }
        },
      })
    )
  })
  return { MarkdownEditor: MockMarkdownEditor }
})

// Mock document.execCommand (not implemented in happy-dom)
Object.defineProperty(document, 'execCommand', {
  value: vi.fn().mockReturnValue(true),
  writable: true,
})

// Mock remark-gfm
vi.mock('remark-gfm', () => ({
  default: () => {},
}))

// Mock remark-source-line
vi.mock('@/lib/remark-source-line', () => ({
  remarkSourceLine: () => {},
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
    const setViewportWidth = (width: number) => {
      Object.defineProperty(window, 'innerWidth', {
        value: width,
        writable: true,
        configurable: true,
      })
      window.dispatchEvent(new Event('resize'))
    }

    const mockNote: Note = {
        id: '1',
        title: 'Initial content',
        content: 'Initial content',
        user_id: 'u1',
        folder_id: null,
        version: 1,
        created_at: '',
        updated_at: '',
        deleted_at: null,
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

  beforeEach(() => {
    localStorage.clear()
    setViewportWidth(1280)
  })

  afterEach(() => {
    localStorage.clear()
    setViewportWidth(1280)
    document.body.classList.remove('printing-note-preview')
  })

  it('renders with initial content', () => {
    render(<EditorPanel {...defaultProps} />)

    const textarea = screen.getByRole('textbox', { name: /content/i }) as HTMLTextAreaElement
    expect(textarea.value).toBe('Initial content')
  })

  it('disables content field sizing for the editor textarea', () => {
    render(<EditorPanel {...defaultProps} />)

    expect(screen.getByRole('textbox', { name: /content/i })).not.toHaveClass('field-sizing-content')
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
    vi.advanceTimersByTime(600)

    // Only changed fields are sent; title was not modified, so only content is included.
    expect(defaultProps.onUpdateNote).toHaveBeenCalledWith('1', { content: 'New content' })
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

  it('displays translated remote failure status', () => {
    const props = {
        ...defaultProps,
        syncStatus: {
          ...defaultProps.syncStatus,
          remote: 'failed' as const,
          lastError: 'sync.serverSyncFailed',
        }
    }
    render(<EditorPanel {...props} />)
    expect(screen.getByText('sync.failedSavedLocally')).toBeInTheDocument()
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

  it('does not render the print preview during normal editing', () => {
    render(<EditorPanel {...defaultProps} />)

    expect(screen.queryByTestId('editor-print-preview')).not.toBeInTheDocument()
  })

  it('prints the rendered preview content and cleans up print mode', async () => {
    const printMock = vi.fn()
    const originalPrint = window.print
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame

    Object.defineProperty(window, 'print', {
      value: printMock,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'requestAnimationFrame', {
      value: vi.fn((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      }),
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    })

    render(<EditorPanel {...defaultProps} />)

    fireEvent.change(screen.getByTestId('editor-title-input'), { target: { value: 'Printed title' } })
    fireEvent.change(screen.getByRole('textbox', { name: /content/i }), { target: { value: '# Printed body' } })
    fireEvent.click(screen.getByTestId('editor-print-button'))

    const printPreview = screen.getByTestId('editor-print-preview')
    expect(printPreview).toHaveClass('note-print-portal')
    expect(document.body).toContainElement(printPreview)
    expect(within(printPreview).getByText('Printed title')).toBeInTheDocument()
    expect(within(printPreview).getByText('# Printed body')).toBeInTheDocument()
    expect(document.body).toHaveClass('printing-note-preview')
    expect(printMock).toHaveBeenCalledTimes(1)

    fireEvent(window, new Event('afterprint'))

    expect(document.body).not.toHaveClass('printing-note-preview')
    expect(screen.queryByTestId('editor-print-preview')).not.toBeInTheDocument()

    Object.defineProperty(window, 'print', {
      value: originalPrint,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'requestAnimationFrame', {
      value: originalRequestAnimationFrame,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      value: originalCancelAnimationFrame,
      writable: true,
      configurable: true,
    })
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      HTMLElement.prototype.requestFullscreen = requestFullscreenMock as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      document.exitFullscreen = exitFullscreenMock as any
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

    describe('Hash calculation debounce (idle/2000ms)', () => {
      afterEach(() => {
        vi.useRealTimers()
      })

      it('does not calculate hash before 2000ms have elapsed', () => {
        vi.useFakeTimers()
        render(<EditorPanel {...defaultProps} />)
        mockCalculateHash.mockClear() // clear the initial mount call

        const textarea = screen.getByRole('textbox', { name: /content/i })
        fireEvent.change(textarea, { target: { value: 'New content' } })

        vi.advanceTimersByTime(1999)
        expect(mockCalculateHash).not.toHaveBeenCalled()
      })

      it('calculates hash after 2000ms have elapsed', () => {
        vi.useFakeTimers()
        render(<EditorPanel {...defaultProps} />)
        mockCalculateHash.mockClear()

        const textarea = screen.getByRole('textbox', { name: /content/i })
        fireEvent.change(textarea, { target: { value: 'New content' } })

        vi.advanceTimersByTime(2000)
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

        // 1999ms elapsed since last change — not yet triggered
        vi.advanceTimersByTime(1999)
        expect(mockCalculateHash).not.toHaveBeenCalled()

        // 2000ms after last change — triggered once with final value
        vi.advanceTimersByTime(1)
        expect(mockCalculateHash).toHaveBeenCalledTimes(1)
        expect(mockCalculateHash).toHaveBeenCalledWith('abc')
      })
    })
  })

  describe('contentOverride is scoped to its source note', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not apply note A accepted edit to note B after key-switch remount', () => {
      vi.useFakeTimers()
      const onUpdateNote = vi.fn()

      const noteA = { ...mockNote, id: 'A', content: 'A original' }
      const noteB = { ...mockNote, id: 'B', content: 'B original' }
      const overrideForA = { noteId: 'A', content: 'A edited', version: 1 }

      // Render EditorPanel for note A with the override — the editor should show "A edited"
      const { rerender } = render(
        <EditorPanel
          {...defaultProps}
          key={noteA.id}
          note={noteA}
          contentOverride={overrideForA}
          onUpdateNote={onUpdateNote}
        />
      )
      expect(
        (screen.getByRole('textbox', { name: /content/i }) as HTMLTextAreaElement).value
      ).toBe('A edited')

      // Simulate switching to note B while parent has not yet cleared contentOverride
      // (worst case: the note switch arrives before the parent's setContentOverride(null))
      rerender(
        <EditorPanel
          {...defaultProps}
          key={noteB.id}
          note={noteB}
          contentOverride={overrideForA}  // still A's override
          onUpdateNote={onUpdateNote}
        />
      )

      // B's editor must show B's own content, not A's edited content
      expect(
        (screen.getByRole('textbox', { name: /content/i }) as HTMLTextAreaElement).value
      ).toBe('B original')

      // Auto-save must NOT write "A edited" into note B
      act(() => { vi.advanceTimersByTime(600) })
      expect(onUpdateNote).not.toHaveBeenCalledWith(
        'B',
        expect.objectContaining({ content: 'A edited' })
      )
    })

    it('applies contentOverride only when noteId matches the current note', () => {
      const noteB = { ...mockNote, id: 'B', content: 'B original' }
      const overrideForA = { noteId: 'A', content: 'A edited', version: 1 }
      const overrideForB = { noteId: 'B', content: 'B edited', version: 2 }

      const { rerender } = render(
        <EditorPanel {...defaultProps} note={noteB} contentOverride={overrideForA} />
      )
      // Override is for A, not B — B shows its own content
      expect(
        (screen.getByRole('textbox', { name: /content/i }) as HTMLTextAreaElement).value
      ).toBe('B original')

      // Now supply override for B — it should be applied
      rerender(
        <EditorPanel {...defaultProps} note={noteB} contentOverride={overrideForB} />
      )
      expect(
        (screen.getByRole('textbox', { name: /content/i }) as HTMLTextAreaElement).value
      ).toBe('B edited')
    })
  })

})
