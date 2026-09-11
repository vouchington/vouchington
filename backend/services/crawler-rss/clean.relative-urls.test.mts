import { it, expect, describe } from 'vitest'
import { buildRssFeedItemsFromFeed } from './clean.mts'
import type { ParsedFeed } from './types.mts'

describe('clean.relative-urls', () => {
  it('buildRssFeedItemsFromFeed resolves absolute-path relative links against feedUrl', () => {
    const feed: ParsedFeed = {
      entries: [{ links: [{ href: '/modern-shell-slidy/' }], id: 'slug-1', title: 'Slidy' }],
    }
    const result = buildRssFeedItemsFromFeed(feed, 'https://example.com/feed.xml')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://example.com/modern-shell-slidy/')
  })

  it('buildRssFeedItemsFromFeed resolves relative links against feedUrl', () => {
    const feed: ParsedFeed = {
      items: [{ link: 'post.html', guid: 'rel-1', title: 'Relative' }],
    }
    const result = buildRssFeedItemsFromFeed(feed, 'https://example.com/blog/feed.rss')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://example.com/blog/post.html')
  })

  it('buildRssFeedItemsFromFeed resolves protocol-relative links against feedUrl scheme', () => {
    const feed: ParsedFeed = {
      items: [{ link: '//other.example.com/page', guid: 'prel-1', title: 'Proto-rel' }],
    }
    const result = buildRssFeedItemsFromFeed(feed, 'https://feed.example.com/feed.xml')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://other.example.com/page')
  })

  it('buildRssFeedItemsFromFeed leaves absolute links unchanged when feedUrl is set', () => {
    const feed: ParsedFeed = {
      items: [{ link: 'https://other.com/article', guid: 'abs-1', title: 'Abs' }],
    }
    const result = buildRssFeedItemsFromFeed(feed, 'https://feed.example.com/feed.xml')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://other.com/article')
  })

  it('buildRssFeedItemsFromFeed drops items with relative links when feedUrl is empty', () => {
    const feed: ParsedFeed = {
      items: [
        { link: '/relative/path', guid: 'rel-drop-1', title: 'Will be dropped' },
        { link: 'https://example.com/ok', guid: 'abs-keep-1', title: 'Kept' },
      ],
    }
    const result = buildRssFeedItemsFromFeed(feed)
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://example.com/ok')
  })

  it('buildRssFeedItemsFromFeed trims whitespace from rawLink before URL resolution', () => {
    const feed: ParsedFeed = {
      items: [{ link: '  https://example.com/space  ', guid: 'ws-1', title: 'Whitespace' }],
    }
    const result = buildRssFeedItemsFromFeed(feed, 'https://feed.example.com/')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://example.com/space')
  })
})
