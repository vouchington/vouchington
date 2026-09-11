import { describe, expect, it } from 'vitest'
import { extractFeedLinkFromCrawlLinks } from './discover-feed.mts'

const BASE_URL = 'https://example.com/'

describe('extractFeedLinkFromCrawlLinks', () => {
  it('returns the RSS feed URL when crawler links include an RSS alternate', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        { alternate: { 'application/rss+xml': ['/feed.xml'] } },
        BASE_URL,
      ),
    ).toBe('https://example.com/feed.xml')
  })

  it('resolves absolute href as-is', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        { alternate: { 'application/rss+xml': ['https://other.example.com/rss'] } },
        BASE_URL,
      ),
    ).toBe('https://other.example.com/rss')
  })

  it('returns an Atom feed URL when only atom link is present', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        { alternate: { 'application/atom+xml': ['/atom.xml'] } },
        BASE_URL,
      ),
    ).toBe('https://example.com/atom.xml')
  })

  it('returns a JSON Feed URL when only feed+json link is present', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        { alternate: { 'application/feed+json': ['/feed.json'] } },
        BASE_URL,
      ),
    ).toBe('https://example.com/feed.json')
  })

  it('returns application/json feed when only that type is present', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        { alternate: { 'application/json': ['/feed.json'] } },
        BASE_URL,
      ),
    ).toBe('https://example.com/feed.json')
  })

  it('prefers RSS over Atom when both are present', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        {
          alternate: {
            'application/atom+xml': ['/atom.xml'],
            'application/rss+xml': ['/rss.xml'],
          },
        },
        BASE_URL,
      ),
    ).toBe('https://example.com/rss.xml')
  })

  it('prefers Atom over feed+json when both are present', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        {
          alternate: {
            'application/feed+json': ['/feed.json'],
            'application/atom+xml': ['/atom.xml'],
          },
        },
        BASE_URL,
      ),
    ).toBe('https://example.com/atom.xml')
  })

  it('accepts a scalar href value from crawler links', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        { alternate: { 'application/rss+xml': '/feed.xml' } },
        BASE_URL,
      ),
    ).toBe('https://example.com/feed.xml')
  })

  it('is case-insensitive for feed MIME type keys', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        { alternate: { 'Application/RSS+XML': ['/feed.xml'] } },
        BASE_URL,
      ),
    ).toBe('https://example.com/feed.xml')
  })

  it('skips invalid/non-public URLs and returns the next valid candidate', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        {
          alternate: {
            'application/rss+xml': ['http://localhost/feed.xml', '/feed.xml'],
          },
        },
        BASE_URL,
      ),
    ).toBe('https://example.com/feed.xml')
  })

  it('returns null when links do not contain alternate feeds', () => {
    expect(extractFeedLinkFromCrawlLinks({ canonical: BASE_URL }, BASE_URL)).toBeNull()
  })

  it('returns null when href resolves to the same URL as the page', () => {
    expect(
      extractFeedLinkFromCrawlLinks(
        { alternate: { 'application/rss+xml': ['https://example.com/'] } },
        BASE_URL,
      ),
    ).toBeNull()
  })

  it('handles null and malformed crawler links', () => {
    expect(extractFeedLinkFromCrawlLinks(null, BASE_URL)).toBeNull()
    expect(extractFeedLinkFromCrawlLinks({ alternate: ['not-an-object'] }, BASE_URL)).toBeNull()
  })
})
