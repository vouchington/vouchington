import { describe, expect, it } from 'vitest'
import {
  makeRssFeed,
  makeRssFeedItem,
  makeRssFeedItemCategory,
  makeRssFeedItemTopic,
  makeRssFeedItemsFeedResponse,
} from './rss-feed-items'
import type { RssFeedItem } from '@/types/rss-feed-items'

describe('RSS feed item API response factories', () => {
  it('builds a default serialized RSS feed item', () => {
    const item: RssFeedItem = makeRssFeedItem()

    expect(item).toMatchObject({
      __entity_type: 'rss_feed_item',
      id: 'item-1',
      published_at: '2026-01-01T00:00:00Z',
      lingua_rs_detected_language: null,
      data: { link: 'https://example.com/article', guid: 'guid-1', title: 'Test Article' },
      url: { id: 'url-1', url: 'https://example.com/article' },
      rss_feed: {
        __entity_type: 'rss_feed',
        id: 'feed-1',
        title: 'Example Feed',
        feed_type: 'article',
      },
      rss_feed_sources: [],
      categories: [
        {
          id: 'category-1',
          category_text: '#Travel',
          hashtag: {
            id: '00000000-0000-7000-8000-000000000101',
            key: 'travel',
            display_token: '#Travel',
            topic_id: 'topic-1',
          },
          topic: {
            id: 'topic-1',
            name: 'Tech',
            slug: 'tech',
            topic_type: 'topic',
          },
          votes_score_net: 3,
        },
      ],
    })
  })

  it('applies nested item overrides without dropping required fields', () => {
    const item = makeRssFeedItem({
      id: 'item-2',
      data: { title: 'Override Title', thumbnail_url: 'https://example.com/thumb.png' },
      url: { id: 'url-2' },
      rss_feed: { id: 'feed-2', title: 'Override Feed', topic: { slug: 'override-topic' } },
    })

    expect(item.id).toBe('item-2')
    expect(item.data).toMatchObject({
      link: 'https://example.com/article',
      guid: 'guid-1',
      title: 'Override Title',
      thumbnail_url: 'https://example.com/thumb.png',
    })
    expect(item.url).toEqual({
      canonical_url_id: null,
      id: 'url-2',
      url: 'https://example.com/article',
    })
    expect(item.rss_feed).toMatchObject({ id: 'feed-2', title: 'Override Feed' })
    expect(item.rss_feed.topic).toMatchObject({ id: 'topic-1', slug: 'override-topic' })
  })

  it('builds plain-text and topic-linked category fixtures', () => {
    const topic = makeRssFeedItemTopic({ id: 'topic-2', name: 'Security', slug: 'security' })
    const plain = makeRssFeedItemCategory({ category_text: 'Open Source' })
    const linked = makeRssFeedItemCategory({
      id: 'rel-topic-2',
      category_text: 'security',
      topic,
      votes_score_net: 3,
    })

    expect(plain).toEqual({
      id: null,
      category_text: 'Open Source',
      topic: null,
      hashtag: null,
      votes_score_net: null,
    })
    expect(linked).toEqual({
      id: 'rel-topic-2',
      category_text: 'security',
      topic,
      hashtag: null,
      votes_score_net: 3,
    })
  })

  it('preserves explicit null values in optional serialized fields', () => {
    const feed = makeRssFeed({ podcast_show: null })
    const category = makeRssFeedItemCategory({ id: null, topic: null, votes_score_net: null })
    const item = makeRssFeedItem({ lingua_rs_detected_language: null, categories: [category] })

    expect(feed.podcast_show).toBeNull()
    expect(item.lingua_rs_detected_language).toBeNull()
    expect(item.categories[0]).toBe(category)
  })

  it('builds a feed response with derived result refs and item maps', () => {
    const item = makeRssFeedItem({ id: 'item-2', published_at: '2026-02-01T00:00:00Z' })

    const response = makeRssFeedItemsFeedResponse({ rssFeedItems: [item] })

    expect(response.results).toEqual([
      {
        __entity_type: 'rss_feed_item',
        id: 'item-2',
        published_at: '2026-02-01T00:00:00Z',
        story_id: null,
      },
    ])
    expect(response.rss_feed_items).toEqual({ 'item-2': item })
    expect(response.rss_feed_item_elections).toEqual({})
    expect(response.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })
})
