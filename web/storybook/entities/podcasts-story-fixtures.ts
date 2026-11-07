import type { ViewRssFeed } from '@/types/rss-feeds'

export function makePodcastFeed(id: string, overrides?: Partial<ViewRssFeed>): ViewRssFeed {
  return {
    __entity_type: 'rss_feed',
    id,
    title: 'Planet Money',
    is_enabled: true,
    is_discoverable: true,
    etag: null,
    last_modified_at: '2024-01-01T00:00:00Z',
    last_fetched_at: '2024-01-01T00:00:00Z',
    feed_type: 'podcast',
    rss_feed_url: { id: `url-${id}`, url: 'https://feeds.npr.org/510289/podcast.xml' },
    home_page_url: { id: `home-${id}`, url: 'https://npr.org/planetmoney' },
    topic: {
      id: `topic-${id}`,
      name: 'Planet Money',
      slug: 'planet-money',
      topic_type: 'topic',
    },
    podcast_show: {
      itunes_author: 'NPR',
      itunes_owner_name: 'NPR Podcasts',
      cover_art_url: null,
      is_explicit: false,
      itunes_type: 'episodic',
    },
    categories: [
      { category_text: 'business', topic_id: null, topic_slug: null },
      { category_text: 'news', topic_id: null, topic_slug: null },
    ],
    ...overrides,
  } as ViewRssFeed
}
