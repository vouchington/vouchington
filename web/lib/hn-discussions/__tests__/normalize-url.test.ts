import { describe, expect, it } from 'vitest'
import { collectHnDiscussionUrls, normalizeHnDiscussionUrl } from '../normalize-url'

describe('normalizeHnDiscussionUrl', () => {
  it('lowercases the host, strips hash, trailing slash, and utm params', () => {
    expect(
      normalizeHnDiscussionUrl('https://News.YCombinator.com/item/?utm_source=x&id=1#comments'),
    ).toBe('https://news.ycombinator.com/item?id=1')
  })

  it('returns null for invalid and non-http URLs', () => {
    expect(normalizeHnDiscussionUrl('not a url')).toBeNull()
    expect(normalizeHnDiscussionUrl('javascript:alert(1)')).toBeNull()
  })
})

describe('collectHnDiscussionUrls', () => {
  it('dedupes by normalized URL and caps at three', () => {
    expect(
      collectHnDiscussionUrls([
        'https://example.com/a/',
        'https://EXAMPLE.com/a',
        'https://example.com/b?utm_campaign=1',
        'https://example.com/c',
        'https://example.com/d',
        null,
      ]),
    ).toEqual([
      'https://example.com/a/',
      'https://example.com/b?utm_campaign=1',
      'https://example.com/c',
    ])
  })
})
