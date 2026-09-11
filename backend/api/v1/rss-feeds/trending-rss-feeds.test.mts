import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  createTestUserDirect,
  insertTestTopic,
  insertTestRssFeed,
  insertEntityRelation,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { updateRssFeedById } from '@services/rss-feeds'

describe('trending-rss-feeds', () => {
  let admin: PrivateUser
  let trendingFeedId: string
  let secondaryTrendingFeedId: string
  let hiddenTrendingFeedId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Trending API Topic ${random}`,
      slug: `trending-api-topic-${random}`,
      createdById: admin.id,
    })
    trendingFeedId = await insertTestRssFeed({
      topicId,
      title: `Trending API Feed ${random}`,
    })
    const secondaryTopicId = await insertTestTopic({
      name: `Secondary Trending API Topic ${random}`,
      slug: `secondary-trending-api-topic-${random}`,
      createdById: admin.id,
    })
    secondaryTrendingFeedId = await insertTestRssFeed({
      topicId: secondaryTopicId,
      title: `Secondary Trending API Feed ${random}`,
    })
    const hiddenTopicId = await insertTestTopic({
      name: `Hidden Trending API Topic ${random}`,
      slug: `hidden-trending-api-topic-${random}`,
      createdById: admin.id,
    })
    hiddenTrendingFeedId = await insertTestRssFeed({
      topicId: hiddenTopicId,
      title: `Hidden Trending API Feed ${random}`,
    })
    await updateRssFeedById(hiddenTrendingFeedId, { discoverable: false })
    // Add many follows to make it trend with a high score (score = follows * 3)
    await addFollowerRelations(trendingFeedId, 50)
    await addFollowerRelations(secondaryTrendingFeedId, 49)
    await addFollowerRelations(hiddenTrendingFeedId, 50)
  }, 60_000)

  async function addFollowerRelations(rssFeedId: string, count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      const follower = await createTestUserDirect()
      await insertEntityRelation('relation__user__follow__rss_feed', follower!.id, rssFeedId)
    }
  }

  describe('GET /api/v1/rss-feeds/trending', () => {
    it('returns 200 with results and page_info', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/rss-feeds/trending').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.page_info).toBeDefined()
    })

    it('includes rss_feeds map in response', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/rss-feeds/trending?limit=100').expect(200)

      expect(response.body.rss_feeds).toBeDefined()
    })

    it('returns cache-control header for anonymous users', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/rss-feeds/trending').expect(200)

      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
      )
    })

    it('does not set cache-control for authenticated users', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/rss-feeds/trending').expect(200)

      expect(response.headers['cache-control']).toBeUndefined()
    })

    it('returns 400 for invalid time_range', async () => {
      const request = createRequest()
      await request.get('/api/v1/rss-feeds/trending?time_range=year').expect(400)
    })

    it('returns 400 for negative min_score', async () => {
      const request = createRequest()
      await request.get('/api/v1/rss-feeds/trending?min_score=-1').expect(400)
    })

    it('supports time_range=week', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/rss-feeds/trending?time_range=week').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('supports time_range=month', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/rss-feeds/trending?time_range=month').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('includes the trending feed in results when using large limit', async () => {
      // Authenticate to bypass the Valkey search cache so newly-created feeds are visible
      // Use min_score to filter out low-scoring accumulated feeds from prior test runs
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get('/api/v1/rss-feeds/trending?limit=100&min_score=50')
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(trendingFeedId)
      expect(ids).not.toContain(hiddenTrendingFeedId)
    })

    it('supports pagination with limit and after cursor', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const first = await request.get('/api/v1/rss-feeds/trending?limit=1&min_score=50').expect(200)

      expect(first.body.page_info.has_next_page).toBe(true)
      const cursor = first.body.page_info.end_cursor
      const second = await request
        .get(`/api/v1/rss-feeds/trending?limit=1&min_score=50&after=${cursor}`)
        .expect(200)
      expect(second.body.results[0]?.id).not.toBe(first.body.results[0]?.id)
    })
  })
})
