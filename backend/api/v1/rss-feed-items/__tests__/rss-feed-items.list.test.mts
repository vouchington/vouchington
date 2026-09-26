import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { createTopicAliases } from '@services/topics/aliases'
describe('RSS Feed Items Routes', () => {
  describe('GET /api/v1/rss-feed-items', () => {
    it('should return rss feed items and cache headers for logged-out users', async () => {
      const topic = await createTestTopic()
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const { id: itemId } = await createTestRssFeedItemWithUrl(feedId)

      const request = createRequest()
      const response = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, limit: '10' })
        .expect(200)

      expect(response.body.rss_feed_items).toBeDefined()
      expect(typeof response.body.rss_feed_items).toBe('object')
      expect(
        response.body.results.find((result: { id: string }) => result.id === itemId),
      ).toBeDefined()
      expect(response.body.rss_feed_items[itemId]).toBeDefined()
      expect(response.body.rss_feed_item_embeds[itemId]).toMatchObject({
        rss_feed_item_id: itemId,
        source_url: expect.any(String),
      })
      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
      )
    })

    it('should support filtering by rss_feeds', async () => {
      const user = await createTestUser()
      const topic = await createTestTopic({ user: user })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      await createTestRssFeedItemWithUrl(feedId)

      const request = createRequest()
      const response = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, limit: '5' })
        .expect(200)

      const items = Object.values(response.body.rss_feed_items) as Array<{
        rss_feed: { id: string }
      }>
      expect(items.every(item => item.rss_feed.id === feedId)).toBe(true)
    })

    it('accepts CSV and repeated singular media_type aliases while rejecting invalid media types', async () => {
      const topic = await createTestTopic()
      const feedId = await createTestRssFeedWithTiming(topic.id)
      await createTestRssFeedItemWithUrl(feedId)
      const request = createRequest()

      await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, media_type: 'audio,video', media_types: 'article' })
        .expect(200)
      await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, media_type: ['audio', 'video'] })
        .expect(200)
      await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, media_type: 'podcast' })
        .expect(422)
    })

    it('should support filtering by topic alias', async () => {
      const user = await createTestUser()
      const topic = await createTestTopic({ user: user })
      const otherTopic = await createTestTopic({ user: user })
      const alias = `rss-topic-alias-${Math.random().toString(36).slice(2, 10)}`
      await createTopicAliases(topic.id, alias)

      const feedId = await createTestRssFeedWithTiming(topic.id)
      const otherFeedId = await createTestRssFeedWithTiming(otherTopic.id)
      await createTestRssFeedItemWithUrl(feedId)
      await createTestRssFeedItemWithUrl(otherFeedId)

      const request = createRequest()
      const response = await request
        .get('/api/v1/rss-feed-items')
        .query({ topic: alias, limit: '10' })
        .expect(200)

      const items = Object.values(response.body.rss_feed_items) as Array<{
        rss_feed: { topic: { id: string } }
      }>
      expect(items.length).toBeGreaterThan(0)
      expect(items.every(item => item.rss_feed.topic.id === topic.id)).toBe(true)
    })

    it('should use streaming pattern with objects not arrays', async () => {
      const topic = await createTestTopic()
      const feedId = await createTestRssFeedWithTiming(topic.id)

      // Create multiple items
      for (let i = 0; i < 3; i++) {
        await createTestRssFeedItemWithUrl(feedId)
      }

      const request = createRequest()
      const response = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId })
        .expect(200)

      // Verify streaming pattern structure
      expect(typeof response.body.rss_feed_items).toBe('object')
      expect(Array.isArray(response.body.rss_feed_items)).toBe(false)
      expect(Array.isArray(response.body.results)).toBe(true)

      // Verify each result has corresponding item in rss_feed_items object
      expect(response.body.results.length).toBeGreaterThan(0)
      response.body.results.forEach((result: { id: string }) => {
        expect(response.body.rss_feed_items[result.id]).toBeDefined()
      })
    })

    it('should handle cursor pagination across multiple pages', async () => {
      const topic = await createTestTopic()
      const feedId = await createTestRssFeedWithTiming(topic.id)

      // Create 3 items so limit=1 produces multiple pages
      for (let i = 0; i < 3; i++) {
        await createTestRssFeedItemWithUrl(feedId)
      }

      const request = createRequest()

      // Page 1
      const page1 = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, limit: '1' })
        .expect(200)

      expect(page1.body.results).toHaveLength(1)
      expect(page1.body.page_info.has_next_page).toBe(true)
      expect(page1.body.page_info.end_cursor).toBeTruthy()

      // Page 2 using end_cursor
      const page2 = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, limit: '1', after: page1.body.page_info.end_cursor })
        .expect(200)

      expect(page2.body.results).toHaveLength(1)
      expect(page2.body.page_info.has_next_page).toBe(true)
      expect(page2.body.page_info.end_cursor).toBeTruthy()
      expect(page2.body.results[0].id).not.toBe(page1.body.results[0].id)

      // Page 3 using end_cursor
      const page3 = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, limit: '1', after: page2.body.page_info.end_cursor })
        .expect(200)

      expect(page3.body.results).toHaveLength(1)
      expect(page3.body.page_info.has_next_page).toBe(false)
      expect(page3.body.results[0].id).not.toBe(page1.body.results[0].id)
      expect(page3.body.results[0].id).not.toBe(page2.body.results[0].id)

      // Beyond last page: reuse the last item's cursor to verify empty results
      // Manually build a cursor from the last result to request beyond it
      const lastResult = page3.body.results[0]
      const beyondCursor = Buffer.from(
        JSON.stringify({
          timestamp: new Date(lastResult.published_at).getTime(),
          id: lastResult.id,
        }),
      ).toString('base64')

      const beyondPage = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, limit: '1', after: beyondCursor })
        .expect(200)

      expect(beyondPage.body.results).toHaveLength(0)
      expect(beyondPage.body.page_info.has_next_page).toBe(false)
    })

    it('should include all story members in rss_feed_items and story_member_ids sidecars', async () => {
      const user = await createTestUser()
      const topic = await createTestTopic({ user: user })
      const feedId = await createTestRssFeedWithTiming(topic.id)

      // Two items sharing a story_id is the real "similar items" grouping mechanism: the search
      // query dedupes same-story items down to one canonical result (see the story_rn partition
      // in searchRssFeedItems), and the route resolves the rest via story_member_ids. There is no
      // `similar_rss_feed_item_ids` field on results — asserting through embeddings alone (the
      // prior version of this test) never actually exercised dedup or the sidecar.
      const { id: firstItemId } = await createTestRssFeedItemWithUrl(feedId)
      const { id: secondItemId } = await createTestRssFeedItemWithUrl(feedId)
      const story = await insertTestStory()
      await setTestItemStoryId(firstItemId, story.id)
      await setTestItemStoryId(secondItemId, story.id)

      const request = createRequest()
      const response = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, limit: '10' })
        .expect(200)

      // Search dedupes same-story items to a single canonical result.
      expect(response.body.results).toHaveLength(1)
      expect([firstItemId, secondItemId]).toContain(response.body.results[0].id)
      expect(response.body.results[0].story_id).toBe(story.id)

      // Both story members (not just the canonical result) are resolvable via the sidecars.
      expect(response.body.story_member_ids[story.id]).toEqual(
        expect.arrayContaining([firstItemId, secondItemId]),
      )
      expect(response.body.rss_feed_items[firstItemId]).toBeDefined()
      expect(response.body.rss_feed_items[secondItemId]).toBeDefined()
    })

    it('should include bookmarks and election_votes for authenticated users', async () => {
      const user = await createTestUser()
      const topic = await createTestTopic({ user: user })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      await createTestRssFeedItemWithUrl(feedId)

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId })
        .expect(200)

      // bookmarks and election_votes are present for authenticated users
      expect(typeof response.body.bookmarks).toBe('object')
      expect(typeof response.body.election_votes).toBe('object')
    })

    it('should not cache for authenticated users', async () => {
      const user = await createTestUser()
      const topic = await createTestTopic({ user: user })
      const feedId = await createTestRssFeedWithTiming(topic.id)
      await createTestRssFeedItemWithUrl(feedId)

      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId })
        .expect(200)

      // Should not have public cache-control for authenticated users
      expect(
        !response.headers['cache-control'] || !response.headers['cache-control'].includes('public'),
      ).toBe(true)
    })

    it('should handle pagination with consistent structure', async () => {
      const topic = await createTestTopic()
      const feedId = await createTestRssFeedWithTiming(topic.id)

      // Create multiple items for pagination
      for (let i = 0; i < 5; i++) {
        await createTestRssFeedItemWithUrl(feedId)
      }

      const request = createRequest()

      // Get first page
      const firstPage = await request
        .get('/api/v1/rss-feed-items')
        .query({ rss_feeds: feedId, limit: '2' })
        .expect(200)

      expect(typeof firstPage.body.rss_feed_items).toBe('object')
      expect(Array.isArray(firstPage.body.results)).toBe(true)

      // Verify all results have corresponding items
      expect(firstPage.body.results.length).toBeGreaterThan(0)
      firstPage.body.results.forEach((result: { id: string }) => {
        expect(firstPage.body.rss_feed_items[result.id]).toBeDefined()
      })
    })
  })
})
