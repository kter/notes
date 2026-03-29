import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Textarea } from './textarea'

describe('Textarea', () => {
  it('uses content field sizing by default', () => {
    render(<Textarea aria-label="Default textarea" />)

    expect(screen.getByRole('textbox', { name: 'Default textarea' })).toHaveClass('field-sizing-content')
  })

  it('allows opting out of content field sizing', () => {
    render(<Textarea aria-label="Fixed textarea" fieldSizing="fixed" />)

    expect(screen.getByRole('textbox', { name: 'Fixed textarea' })).not.toHaveClass('field-sizing-content')
  })
})
