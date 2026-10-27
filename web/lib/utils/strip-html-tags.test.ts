import { describe, it, expect } from 'vitest'
import { stripHtmlTags } from './strip-html-tags'

describe('stripHtmlTags', () => {
  it('strips simple HTML tags', () => {
    expect(stripHtmlTags('<p>Hello <strong>world</strong></p>')).toBe('Hello world')
  })

  it('normalizes whitespace in plain text', () => {
    expect(stripHtmlTags(' \t plain\u00a0 text \n ')).toBe('plain text')
  })
})
