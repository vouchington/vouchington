import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  createTestUser,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { upsertRssFeedItems } from '@services/rss-feed-items'

describe('rss-feed-items.generated', () => {
  it('GET /api/v1/rss-feed-items rejects after with non-base64 value', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/rss-feed-items').query({
      limit: 1,
      after: 'not-base64!!!',
    })

    expect(response.status).toBe(400)
  })

  it('GET /api/v1/rss-feed-items rejects after with empty string', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/rss-feed-items').query({
      limit: 1,
      after: '',
    })

    expect(response.status).toBe(400)
  })

  it('GET /api/v1/rss-feed-items rejects after when base64 is not valid JSON', async () => {
    const request = createRequest()
    // "plain-text" encoded in base64; decodes, but is not JSON
    const nonJsonBase64 = 'cGxhaW4tdGV4dA=='
    const response = await request.get('/api/v1/rss-feed-items').query({
      limit: 1,
      after: nonJsonBase64,
    })

    expect(response.status).toBe(400)
  })

  it('GET /api/v1/rss-feed-items works without after parameter', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/rss-feed-items').query({
      limit: 1,
    })

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('results')
    expect(response.body).toHaveProperty('page_info')
  })

  it('GET /api/v1/rss-feed-items filters by text search q param', async () => {
    const feed = await createTestRssFeed({})
    const random = Math.random().toString(36).slice(2, 15)
    const uniqueWord = `xqzapi${random}`

    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/match-q-${random}`,
        guid: `match-q-${random}`,
        title: `Unique ${uniqueWord} Article`,
        pubDate: '2025-03-01T00:00:00Z',
      },
      {
        link: `https://example.com/nomatch-q-${random}`,
        guid: `nomatch-q-${random}`,
        title: `Unrelated Content ${random}`,
        pubDate: '2025-03-02T00:00:00Z',
      },
    ])

    const request = createRequest()
    const response = await request
      .get('/api/v1/rss-feed-items')
      .query({ rss_feed: feed.id, q: uniqueWord })
      .expect(200)

    // Only the matching item should appear
    expect(response.body.results).toHaveLength(1)
    const item = response.body.rss_feed_items[response.body.results[0].id]
    expect(item?.data?.title).toContain(uniqueWord)
  })

  describe('GET /api/v1/rss-feed-items — elections', () => {
    it('should return rss_feed_item_elections as an object', async () => {
      const topic = await createTestTopic()
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const rssFeedItem = await createTestRssFeedItemWithUrl(feedId)

      // Filter by feed ID to guarantee the item appears in results
      const request = createRequest()
      const response = await request.get(`/api/v1/rss-feed-items?rss_feed=${feedId}`).expect(200)

      expect(typeof response.body.rss_feed_item_elections).toBe('object')
      expect(Array.isArray(response.body.rss_feed_item_elections)).toBe(false)

      // Our specific item must appear and have an election entry with vote fields
      expect(response.body.results.some((r: { id: string }) => r.id === rssFeedItem.id)).toBe(true)
      expect(response.body.rss_feed_items[rssFeedItem.id].election).toBeUndefined()
      expect(response.body.rss_feed_item_elections[rssFeedItem.id]).toBeDefined()
      expect(response.body.rss_feed_item_elections[rssFeedItem.id]).toHaveProperty(
        'votes_score_net',
      )
    })
  })

  describe('rss_feed_bookmarks in GET /api/v1/rss-feed-items', () => {
    it('includes rss_feed_bookmarks for authenticated users with subscriptions', async () => {
      const user = await createTestUser()
      const feed = await createTestRssFeed({})
      await createTestRssFeedItemWithUrl(feed.id)

      const request = createRequest()
      await request.authenticateAs(user)

      // Subscribe the user to the feed
      await request.put(`/api/v1/bookmarks/rss_feed/${feed.id}/subscribe`).expect(200)

      const response = await request.get(`/api/v1/rss-feed-items?rss_feed=${feed.id}`).expect(200)

      expect(response.body.rss_feed_bookmarks).toBeDefined()
      expect(response.body.rss_feed_bookmarks[feed.id]).toBeDefined()
      expect(response.body.rss_feed_bookmarks[feed.id].subscribe).toBe(true)
    })

    it('does not include rss_feed_bookmarks for unauthenticated requests', async () => {
      const feed = await createTestRssFeed({})
      await createTestRssFeedItemWithUrl(feed.id)

      const request = createRequest()
      const response = await request.get(`/api/v1/rss-feed-items?rss_feed=${feed.id}`).expect(200)

      expect(response.body.rss_feed_bookmarks).toBeUndefined()
    })
  })
})
