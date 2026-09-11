import { describe, expect, it } from 'vitest'
import { absolutizeSideloadImageSources } from './absolute-sideload-html.mts'

describe('absolutizeSideloadImageSources', () => {
  it('rewrites only serialized relative sideload src attributes', () => {
    const html =
      '<img src="/sideload/abc?w=1200&amp;sig=xyz" alt="/sideload/keep">' +
      '<a href="/sideload/keep">keep</a>'
    expect(absolutizeSideloadImageSources(html, 'https://images.example.com')).toBe(
      '<img src="https://images.example.com/sideload/abc?w=1200&amp;sig=xyz" alt="/sideload/keep">' +
        '<a href="/sideload/keep">keep</a>',
    )
  })

  it('returns unrelated HTML byte-for-byte', () => {
    const html = '<p data-value="/sideload/nope">unchanged &amp; safe</p>'
    expect(absolutizeSideloadImageSources(html, 'https://images.example.com')).toBe(html)
  })
})
