import { it, expect, describe } from 'vitest'
import { buildBoundedRssFeedItemsFromFeed } from './clean.mts'
import type { ParsedFeed } from './types.mts'

function buildItems(feed: ParsedFeed, feedUrl?: string) {
  return buildBoundedRssFeedItemsFromFeed(feed, feedUrl, {
    maxItems: Number.POSITIVE_INFINITY,
  }).items
}

describe('clean.relative-urls', () => {
  it('buildItems resolves absolute-path relative links against feedUrl', () => {
    const feed: ParsedFeed = {
      entries: [{ links: [{ href: '/modern-shell-slidy/' }], id: 'slug-1', title: 'Slidy' }],
    }
    const result = buildItems(feed, 'https://example.com/feed.xml')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://example.com/modern-shell-slidy/')
  })

  it('buildItems resolves relative links against feedUrl', () => {
    const feed: ParsedFeed = {
      items: [{ link: 'post.html', guid: 'rel-1', title: 'Relative' }],
    }
    const result = buildItems(feed, 'https://example.com/blog/feed.rss')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://example.com/blog/post.html')
  })

  it('buildItems resolves protocol-relative links against feedUrl scheme', () => {
    const feed: ParsedFeed = {
      items: [{ link: '//other.example.com/page', guid: 'prel-1', title: 'Proto-rel' }],
    }
    const result = buildItems(feed, 'https://feed.example.com/feed.xml')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://other.example.com/page')
  })

  it('buildItems leaves absolute links unchanged when feedUrl is set', () => {
    const feed: ParsedFeed = {
      items: [{ link: 'https://other.com/article', guid: 'abs-1', title: 'Abs' }],
    }
    const result = buildItems(feed, 'https://feed.example.com/feed.xml')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://other.com/article')
  })

  it('buildItems drops items with relative links when feedUrl is empty', () => {
    const feed: ParsedFeed = {
      items: [
        { link: '/relative/path', guid: 'rel-drop-1', title: 'Will be dropped' },
        { link: 'https://example.com/ok', guid: 'abs-keep-1', title: 'Kept' },
      ],
    }
    const result = buildItems(feed)
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://example.com/ok')
  })

  it('buildItems trims whitespace from rawLink before URL resolution', () => {
    const feed: ParsedFeed = {
      items: [{ link: '  https://example.com/space  ', guid: 'ws-1', title: 'Whitespace' }],
    }
    const result = buildItems(feed, 'https://feed.example.com/')
    expect(result).toHaveLength(1)
    expect(result[0].link).toBe('https://example.com/space')
  })
})
