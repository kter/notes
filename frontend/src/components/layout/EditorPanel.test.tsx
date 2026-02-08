
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EditorPanel } from './EditorPanel'
import type { Note } from '@/types'

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
})

