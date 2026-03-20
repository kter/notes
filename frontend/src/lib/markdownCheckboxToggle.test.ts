import { describe, it, expect } from 'vitest'
import { toggleMarkdownCheckbox } from './markdownCheckboxToggle'

describe('toggleMarkdownCheckbox', () => {
  it('toggles unchecked to checked (- [ ])', () => {
    const content = '- [ ] todo item'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('- [x] todo item')
  })

  it('toggles checked to unchecked (- [x])', () => {
    const content = '- [x] done item'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('- [ ] done item')
  })

  it('toggles uppercase [X] to unchecked', () => {
    const content = '- [X] done item'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('- [ ] done item')
  })

  it('toggles with * marker', () => {
    const content = '* [ ] star item'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('* [x] star item')
  })

  it('toggles with + marker', () => {
    const content = '+ [x] plus item'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('+ [ ] plus item')
  })

  it('toggles indented item', () => {
    const content = '  - [ ] indented'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('  - [x] indented')
  })

  it('toggles ordered list item unchecked', () => {
    const content = '1. [ ] ordered item'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('1. [x] ordered item')
  })

  it('toggles ordered list item checked', () => {
    const content = '2. [x] ordered done'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('2. [ ] ordered done')
  })

  it('is a no-op for non-task lines', () => {
    const content = 'Just a regular line'
    expect(toggleMarkdownCheckbox(content, 1)).toBe('Just a regular line')
  })

  it('is a no-op for out-of-range line (too high)', () => {
    const content = '- [ ] item'
    expect(toggleMarkdownCheckbox(content, 99)).toBe('- [ ] item')
  })

  it('is a no-op for out-of-range line (0)', () => {
    const content = '- [ ] item'
    expect(toggleMarkdownCheckbox(content, 0)).toBe('- [ ] item')
  })

  it('preserves other lines in multi-line content', () => {
    const content = 'first line\n- [ ] task\nthird line'
    const result = toggleMarkdownCheckbox(content, 2)
    expect(result).toBe('first line\n- [x] task\nthird line')
  })

  it('toggles the correct line in multi-line content', () => {
    const content = '- [x] line 1\n- [ ] line 2\n- [x] line 3'
    const result = toggleMarkdownCheckbox(content, 2)
    expect(result).toBe('- [x] line 1\n- [x] line 2\n- [x] line 3')
  })
})
