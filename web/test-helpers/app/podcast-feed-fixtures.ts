import type { ViewRssFeed } from '@/types/rss-feeds'

export function makeEmptyResponse() {
  return {
    results: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    topic_elections: {},
    hostname_elections: {},
  }
}

export function makeFeedResponse(feeds: Partial<ViewRssFeed>[]) {
  const results = feeds.map((f, i) => ({
    __entity_type: 'rss_feed' as const,
    id: `feed-${i}`,
    title: f.title ?? `Podcast ${i}`,
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: null,
    last_fetched_at: null,
    feed_type: 'podcast' as const,
    rss_feed_url: { id: `url-${i}`, url: 'https://example.com/feed.xml' },
    home_page_url: null,
    topic: {
      id: `topic-${i}`,
      name: f.title ?? `Podcast ${i}`,
      slug: `podcast-${i}`,
      topic_type: 'rss_feed',
    },
    ...f,
  }))
  return {
    results,
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    topic_elections: {},
    hostname_elections: {},
  }
}
