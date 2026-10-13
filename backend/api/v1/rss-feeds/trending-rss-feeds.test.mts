import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  insertEntityRelation,
} from '@voucha/test-helpers'
import { encodeCursor } from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { updateRssFeedById } from '@services/rss-feeds'

describe('trending-rss-feeds', () => {
  let admin: PrivateUser
  let trendingFeedId: string
  let secondaryTrendingFeedId: string
  let hiddenTrendingFeedId: string
  let ownedBoundary: string
  let secondaryBoundary: string
  let hiddenBoundary: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 8)
    const feedIds: string[] = []
    for (const role of ['Secondary', 'Hidden', 'Primary']) {
      const topicId = await insertTestTopic({
        name: `${role} Trending API Topic ${random}`,
        slug: `${role.toLowerCase()}-trending-api-topic-${random}`,
        createdById: admin.id,
      })
      feedIds.push(
        await insertTestRssFeed({
          topicId,
          title: `${role} Trending API Feed ${random}`,
        }),
      )
    }
    secondaryTrendingFeedId = feedIds[0]!
    hiddenTrendingFeedId = feedIds[1]!
    trendingFeedId = feedIds[2]!
    const rankedFeedIds = [trendingFeedId, hiddenTrendingFeedId, secondaryTrendingFeedId]
      .toSorted()
      .toReversed()
    trendingFeedId = rankedFeedIds[0]!
    hiddenTrendingFeedId = rankedFeedIds[1]!
    secondaryTrendingFeedId = rankedFeedIds[2]!
    await updateRssFeedById(hiddenTrendingFeedId, { discoverable: false })
    for (const feedId of [trendingFeedId, secondaryTrendingFeedId, hiddenTrendingFeedId]) {
      await insertEntityRelation('relation__user__follow__rss_feed', admin.id, feedId)
    }
    const boundaries = [trendingFeedId, secondaryTrendingFeedId, hiddenTrendingFeedId].map(
      feedId => {
        const hex = (BigInt(`0x${feedId.replaceAll('-', '')}`) + 1n).toString(16).padStart(32, '0')
        const id = [
          hex.slice(0, 8),
          hex.slice(8, 12),
          hex.slice(12, 16),
          hex.slice(16, 20),
          hex.slice(20),
        ].join('-')
        return encodeCursor({ id, score: 3 })
      },
    )
    ownedBoundary = boundaries[0]!
    secondaryBoundary = boundaries[1]!
    hiddenBoundary = boundaries[2]!
  }, 5000)

  describe('GET /api/v1/rss-feeds/trending', () => {
    it.each([
      ['nonnumeric', 'abc'],
      ['repeated', '1&min_score=2'],
    ])('rejects a %s min_score', async (_kind, minScore) => {
      const request = createRequest()
      await request.get(`/api/v1/rss-feeds/trending?min_score=${minScore}`).expect(422)
    })

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
      const owned = await request
        .get('/api/v1/rss-feeds/trending')
        .query({ time_range: 'week', after: ownedBoundary })
        .expect(200)
      expect(owned.body.results[0]?.id).toBe(trendingFeedId)
    })

    it('supports time_range=month', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/rss-feeds/trending?time_range=month').expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      const owned = await request
        .get('/api/v1/rss-feeds/trending')
        .query({ time_range: 'month', after: ownedBoundary })
        .expect(200)
      expect(owned.body.results[0]?.id).toBe(trendingFeedId)
    })

    it('includes the trending feed in results when using large limit', async () => {
      // Authenticate to bypass the Valkey search cache so newly-created feeds are visible
      // One recent follow gives score 3; anchor the public descending cursor immediately before the owned feed.
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get('/api/v1/rss-feeds/trending')
        .query({ limit: 100, min_score: 3, after: ownedBoundary })
        .expect(200)

      const ids = response.body.results.map((r: { id: string }) => r.id)
      expect(ids).toContain(trendingFeedId)
      expect(ids).not.toContain(hiddenTrendingFeedId)
      const enabled = await request
        .get('/api/v1/rss-feeds/trending')
        .query({ limit: 1, min_score: 3, after: ownedBoundary })
        .expect(200)
      expect(enabled.body.results[0]?.id).toBe(trendingFeedId)
      const hidden = await request
        .get('/api/v1/rss-feeds/trending')
        .query({ limit: 1, min_score: 3, after: hiddenBoundary })
        .expect(200)
      expect(hidden.body.results).toHaveLength(1)
      expect(hidden.body.results[0]?.id).not.toBe(hiddenTrendingFeedId)
      const belowThreshold = await request
        .get('/api/v1/rss-feeds/trending')
        .query({ limit: 100, min_score: 4, after: ownedBoundary })
        .expect(200)
      expect(belowThreshold.body.results).toEqual([])
    })

    it('supports pagination with limit and after cursor', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const first = await request
        .get('/api/v1/rss-feeds/trending')
        .query({ limit: 1, min_score: 3, after: ownedBoundary })
        .expect(200)
      expect(first.body.results[0]?.id).toBe(trendingFeedId)
      expect(first.body.results).toHaveLength(1)

      expect(first.body.page_info.has_next_page).toBe(true)
      const cursor = first.body.page_info.end_cursor
      const second = await request
        .get(`/api/v1/rss-feeds/trending?limit=1&min_score=3&after=${cursor}`)
        .expect(200)
      expect(second.body.results[0]?.id).not.toBe(first.body.results[0]?.id)
      expect(second.body.results).toHaveLength(1)
      const ownedSecondary = await request
        .get('/api/v1/rss-feeds/trending')
        .query({ limit: 1, min_score: 3, after: secondaryBoundary })
        .expect(200)
      expect(ownedSecondary.body.results[0]?.id).toBe(secondaryTrendingFeedId)
      expect([first.body.results[0]?.id, second.body.results[0]?.id]).not.toContain(
        hiddenTrendingFeedId,
      )
    })
  })
})
