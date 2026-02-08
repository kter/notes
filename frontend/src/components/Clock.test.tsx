import { render } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Clock } from './Clock'
import React from 'react'

describe('Clock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the current time', () => {
    vi.setSystemTime(new Date('2026-02-09T14:30:00'))
    const { getByText } = render(<Clock />)
    expect(getByText('14:30')).toBeInTheDocument()
  })

  it('is memoized with React.memo to prevent unnecessary re-renders', () => {
    // Verify that Clock component is wrapped with React.memo
    // React.memo wraps the component, so the displayName or $$typeof can indicate this
    // For a memoized component, the type will have a 'compare' property or be a memo object
    
    // Check if Clock is a memo component by examining its type
    const clockType = (Clock as unknown as { $$typeof?: symbol })?.$$typeof
    const memoSymbol = Symbol.for('react.memo')
    
    expect(clockType).toBe(memoSymbol)
  })
})
