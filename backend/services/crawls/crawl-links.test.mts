import { describe, expect, it } from 'vitest'
import { flattenCrawlLinks } from './crawl-links.mts'

describe('flattenCrawlLinks', () => {
  it('stores a typed map string as one row', () => {
    expect(
      flattenCrawlLinks({
        alternate: { 'application/rss+xml': 'https://example.com/rss' },
      }),
    ).toEqual([
      {
        rel: 'alternate',
        shape: 'map_string',
        subtype: 'application/rss+xml',
        ordinal: 0,
        href: 'https://example.com/rss',
      },
    ])
  })

  it('rejects a scalar that is not a string', () => {
    expect(() => flattenCrawlLinks({ canonical: 1 })).toThrow(
      'Unsupported crawl link shape for canonical',
    )
  })

  it('rejects a nested value that is not a string or string list', () => {
    expect(() => flattenCrawlLinks({ alternate: { 'application/rss+xml': 1 } })).toThrow(
      'Unsupported crawl link shape for alternate.application/rss+xml',
    )
  })
})
