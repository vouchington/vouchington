import type {
  RssFeedItem,
  RssFeedItemsFeedResponseBody,
  StoryPageResponse,
} from '@/types/rss-feed-items'

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

export function makeStoryMemberPageResponse(
  overrides: Partial<StoryPageResponse> = {},
): StoryPageResponse {
  return {
    story: {
      id: 'story-1',
      title: null,
      cluster_reason: null,
      published_at: null,
      official_rss_feed_item_id: null,
    },
    item_ids: [],
    page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    rss_feed_items: {},
    rss_feed_item_elections: {},
    rss_feed_item_hacker_news_references: {},
    rss_feed_item_embeds: {},
    rss_feed_item_thumbnail_url: {},
    rss_feed_item_content_html: {},
    related_posts_by_url_id: {},
    story_post_ids: {},
    posts: {},
    posts_metrics: {},
    bookmarks: {},
    election_votes: {},
    rss_feed_bookmarks: {},
    ...overrides,
  }
}
