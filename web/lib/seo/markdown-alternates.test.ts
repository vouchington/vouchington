import { describe, expect, it } from 'vitest'
import { getMarkdownAlternatePath } from './markdown-alternates'

describe('getMarkdownAlternatePath', () => {
  it('returns markdown aliases for public post topic and user detail paths', () => {
    expect(getMarkdownAlternatePath('/review/amex-gold')).toBe('/review/amex-gold.md')
    expect(getMarkdownAlternatePath('/topic/credit-cards')).toBe('/topic/credit-cards.md')
    expect(getMarkdownAlternatePath('/user/jong')).toBe('/user/jong.md')
  })

  it('omits markdown aliases for list and internal paths', () => {
    expect(getMarkdownAlternatePath('/reviews')).toBeNull()
    expect(getMarkdownAlternatePath('/my/settings')).toBeNull()
    expect(getMarkdownAlternatePath('/domain/example.com')).toBeNull()
  })
})
