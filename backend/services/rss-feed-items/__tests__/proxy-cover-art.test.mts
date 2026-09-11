import { it, expect, describe } from 'vitest'
import type { ViewRssFeed } from '@voucha/types/entities/rss-feed'
import type { ViewRssFeedItem } from '../types.mts'
import { proxyRssFeedItemCoverArt } from '../proxy-cover-art.mts'

function makeFeed(overrides?: Partial<ViewRssFeed>): ViewRssFeed {
  return {
    __entity_type: 'rss_feed',
    id: 'feed-1',
    title: 'Test Feed',
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: null,
    last_fetched_at: null,
    feed_type: 'podcast',
    rss_feed_url: {
      id: 'url-1',
      url: 'https://example.com/feed.rss',
    } as ViewRssFeed['rss_feed_url'],
    home_page_url: null,
    hostname: null,
    topic: {} as ViewRssFeed['topic'],
    publisher_type: null,
    ...overrides,
  }
}

function makeItem(feedOverrides?: Partial<ViewRssFeed>): ViewRssFeedItem {
  return {
    __entity_type: 'rss_feed_item',
    id: 'item-1',
    guid: 'guid-1',
    published_at: new Date(),
    data: {} as ViewRssFeedItem['data'],
    url: {} as ViewRssFeedItem['url'],
    rss_feed: makeFeed(feedOverrides),
    categories: [],
  }
}

describe('proxyRssFeedItemCoverArt', () => {
  it('returns the same item reference when no cover art URL is present', () => {
    const item = makeItem()
    expect(proxyRssFeedItemCoverArt(item)).toBe(item)
  })

  it('returns a new item with proxied cover_art_url when the primary feed has cover art', () => {
    const item = makeItem({
      podcast_show: {
        itunes_author: 'Author',
        itunes_owner_name: null,
        cover_art_url: 'https://example.com/cover.jpg',
        is_explicit: false,
        itunes_type: null,
      },
    })
    const result = proxyRssFeedItemCoverArt(item)
    expect(result).not.toBe(item)
    expect(result.rss_feed.podcast_show?.cover_art_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
  })

  it('proxies cover art on source feeds and returns a new item', () => {
    const item = makeItem()
    const sourceWithArt = makeFeed({
      id: 'source-feed-1',
      podcast_show: {
        itunes_author: 'Source Author',
        itunes_owner_name: null,
        cover_art_url: 'https://source.example.com/cover.jpg',
        is_explicit: false,
        itunes_type: null,
      },
    })
    const itemWithSources = { ...item, rss_feed_sources: [sourceWithArt] }
    const result = proxyRssFeedItemCoverArt(itemWithSources)
    expect(result).not.toBe(itemWithSources)
    expect(result.rss_feed_sources?.[0]?.podcast_show?.cover_art_url).toMatch(
      /^https?:\/\/[^/]+\/sideload\//,
    )
  })
})
