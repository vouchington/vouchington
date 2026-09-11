import { it, expect, describe } from 'vitest'
import type { ViewRssFeed } from '../types.mts'
import { proxyRssFeedCoverArt } from '../proxy-cover-art.mts'

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

describe('proxyRssFeedCoverArt', () => {
  it('returns the same feed when podcast_show is null', () => {
    const feed = makeFeed({ podcast_show: null })
    expect(proxyRssFeedCoverArt(feed)).toBe(feed)
  })

  it('returns the same feed when podcast_show is absent', () => {
    const feed = makeFeed()
    expect(proxyRssFeedCoverArt(feed)).toBe(feed)
  })

  it('returns the same feed when cover_art_url is null', () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: 'Author',
        itunes_owner_name: null,
        cover_art_url: null,
        is_explicit: false,
        itunes_type: null,
      },
    })
    expect(proxyRssFeedCoverArt(feed)).toBe(feed)
  })

  it('returns a new feed with cover_art_url proxied to a /sideload/ URL', () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: 'Author',
        itunes_owner_name: 'Owner',
        cover_art_url: 'https://example.com/cover.jpg',
        is_explicit: false,
        itunes_type: 'episodic',
      },
    })
    const result = proxyRssFeedCoverArt(feed)
    expect(result).not.toBe(feed)
    expect(result.podcast_show?.cover_art_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
  })

  it('preserves all other podcast_show fields when proxying cover_art_url', () => {
    const feed = makeFeed({
      podcast_show: {
        itunes_author: 'Author',
        itunes_owner_name: 'Owner',
        cover_art_url: 'https://example.com/cover.jpg',
        is_explicit: true,
        itunes_type: 'serial',
      },
    })
    const result = proxyRssFeedCoverArt(feed)
    expect(result.podcast_show?.itunes_author).toBe('Author')
    expect(result.podcast_show?.itunes_owner_name).toBe('Owner')
    expect(result.podcast_show?.is_explicit).toBe(true)
    expect(result.podcast_show?.itunes_type).toBe('serial')
  })
})
