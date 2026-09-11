import type { RssFeedItem, RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'

import { loadWebApiFixture } from './fixture-loader'

export type RssFeedItemTopic = RssFeedItem['rss_feed']['topic']
export type RssFeed = RssFeedItem['rss_feed']
export type RssFeedItemCategory = RssFeedItem['categories'][number]

type RssFeedOverrides = Partial<Omit<RssFeed, 'topic'>> & {
  topic?: Partial<RssFeedItemTopic>
}

type RssFeedItemOverrides = Partial<Omit<RssFeedItem, 'data' | 'url' | 'rss_feed'>> & {
  data?: Partial<RssFeedItem['data']>
  url?: Partial<RssFeedItem['url']>
  rss_feed?: RssFeedOverrides
}

export function makeRssFeedItemTopic(overrides: Partial<RssFeedItemTopic> = {}): RssFeedItemTopic {
  const fixture = loadWebApiFixture('web.rss-feed-items.feed.default')
  const item = Object.values(fixture.rss_feed_items)[0]!
  return {
    ...item.rss_feed.topic,
    ...overrides,
  }
}

export function makeRssFeed(overrides: RssFeedOverrides = {}): RssFeed {
  const { topic: topicOverrides, ...feedOverrides } = overrides
  const fixture = loadWebApiFixture('web.rss-feed-items.feed.default')
  const item = Object.values(fixture.rss_feed_items)[0]!
  const topic = { ...item.rss_feed.topic, ...topicOverrides }

  return {
    ...item.rss_feed,
    topic,
    ...feedOverrides,
  }
}

export function makeRssFeedItemCategory(
  overrides: Partial<RssFeedItemCategory> = {},
): RssFeedItemCategory {
  return {
    id: null,
    category_text: 'tech',
    topic: null,
    hashtag: null,
    votes_score_net: null,
    ...overrides,
  }
}

export function makeRssFeedItem(overrides: RssFeedItemOverrides = {}): RssFeedItem {
  const {
    data: dataOverrides,
    url: urlOverrides,
    rss_feed: rssFeedOverrides,
    ...itemOverrides
  } = overrides

  const fixture = loadWebApiFixture('web.rss-feed-items.feed.default')
  const item = Object.values(fixture.rss_feed_items)[0]!

  return {
    ...item,
    data: {
      ...item.data,
      ...dataOverrides,
    },
    url: {
      ...item.url,
      ...urlOverrides,
    },
    rss_feed: makeRssFeed(rssFeedOverrides),
    ...itemOverrides,
  }
}

export function makeRssFeedItemsFeedResponse({
  rssFeedItems = [makeRssFeedItem()],
  pageInfo = { has_next_page: false, start_cursor: null, end_cursor: null },
}: {
  rssFeedItems?: RssFeedItem[]
  pageInfo?: RssFeedItemsFeedResponseBody['page_info']
} = {}): RssFeedItemsFeedResponseBody {
  return {
    results: rssFeedItems.map(item => ({
      __entity_type: 'rss_feed_item',
      id: item.id,
      published_at: item.published_at,
      story_id: null,
    })),
    page_info: pageInfo,
    rss_feed_items: Object.fromEntries(rssFeedItems.map(item => [item.id, item])),
    rss_feed_item_elections: {},
  }
}
