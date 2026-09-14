import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createTrendingTopicData } from '@voucha/test-helpers/entities/trending-topics'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

describe('trending-topics', () => {
  const testIds: string[] = []
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    testIds.push(admin.id)
  })
  describe('Trending Topics API Routes', () => {
    describe('GET /api/v1/trending-topics', () => {
      it('should return a list of trending topics', async () => {
        const { topicId, feedId, userId } = await createTrendingTopicData({
          postTagCount: 2,
          rssItemTagCount: 1,
          netVote: 1,
        })
        testIds.push(feedId, topicId, userId)

        const request = createRequest()
        const response = await request.get('/api/v1/trending-topics').expect(200)

        expect(response.body).toHaveProperty('topics')
        expect(response.body).toHaveProperty('topics_metrics')
        expect(response.body).toHaveProperty('results')
        expect(response.body).toHaveProperty('page_info')
        expect(typeof response.body.topics).toBe('object')
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )
      })

      it('should return topics as objects (streaming pattern)', async () => {
        // Use a very high tag count to produce a score well above accumulated data
        // from prior test runs (dirty-database pattern). Score = 500*5 + 100 = 2600.
        const { topicId, feedId, userId } = await createTrendingTopicData({
          postTagCount: 500,
          rssItemTagCount: 100,
          netVote: 1,
        })
        testIds.push(feedId, topicId, userId)

        // Use an authenticated request to bypass the Valkey search cache (which caches
        // anon results for 60s) so the newly created topic appears in the response.
        // Use a high min_score to filter out low-scoring accumulated data from prior runs.
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .get('/api/v1/trending-topics?limit=100&min_score=2000')
          .expect(200)

        // Streaming pattern: topics and topics_metrics are objects, not arrays
        expect(typeof response.body.topics).toBe('object')
        expect(Array.isArray(response.body.topics)).toBe(false)
        expect(typeof response.body.topics_metrics).toBe('object')
        expect(Array.isArray(response.body.topics_metrics)).toBe(false)
        // results should still be an array
        expect(Array.isArray(response.body.results)).toBe(true)

        // Only verify our specific topic to avoid race conditions from parallel tests:
        // trending-topics has no user filter, so other tests' topics may appear in results
        // and be deleted mid-flight by their afterAll cleanup.
        expect(response.body.topics[topicId]).toBeDefined()
        expect(response.body.topics_metrics[topicId]).toBeDefined()
      }, 120_000)

      it('should support pagination with limit', async () => {
        // Create multiple trending topics in parallel — each dataset is independent.
        const datasets = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            createTrendingTopicData({
              postTagCount: i + 1,
              rssItemTagCount: 1,
              netVote: 1,
            }),
          ),
        )
        for (const { topicId, feedId, userId } of datasets) {
          testIds.push(feedId, topicId, userId)
        }

        const request = createRequest()
        const response = await request.get('/api/v1/trending-topics?limit=3').expect(200)

        expect(response.body.results).toHaveLength(3)
        expect(response.body.page_info.has_next_page).toBe(true)
        expect(response.body.page_info.end_cursor).toBeDefined()
      }, 60_000)

      it('should support time_range parameter', async () => {
        const { topicId, feedId, userId } = await createTrendingTopicData({
          postTagCount: 2,
          rssItemTagCount: 1,
          netVote: 1,
        })
        testIds.push(feedId, topicId, userId)

        const request = createRequest()
        const response = await request.get('/api/v1/trending-topics?time_range=week').expect(200)

        expect(response.body.results).toBeDefined()
        expect(response.body.page_info).toBeDefined()
      })

      it('should support min_score parameter', async () => {
        const {
          topicId: topicId1,
          feedId: feedId1,
          userId: userId1,
        } = await createTrendingTopicData({
          postTagCount: 5,
          rssItemTagCount: 3,
          netVote: 1,
        })
        testIds.push(feedId1, topicId1, userId1)

        const {
          topicId: topicId2,
          feedId: feedId2,
          userId: userId2,
        } = await createTrendingTopicData({
          postTagCount: 1,
          rssItemTagCount: 1,
          netVote: 1,
        })
        testIds.push(feedId2, topicId2, userId2)

        // Authenticate to bypass the Valkey anonymous search cache (see the "streaming
        // pattern" test above): an anonymous request could return a cached result set from a
        // prior/concurrent request with the same min_score=10 query that predates topicId1,
        // failing the assertion below for up to the cache TTL even though the live filter is
        // correct.
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/trending-topics?min_score=10').expect(200)

        // In the shared dirty database, an older topic could satisfy min_score=10 even if the
        // filter incorrectly excluded topicId1 (which is deliberately given a qualifying
        // score). Assert topicId1 itself is present so this establishes the filter actually
        // includes qualifying topics, not just that the result list happens to be nonempty.
        expect(response.body.results.some((result: { id: string }) => result.id === topicId1)).toBe(
          true,
        )
        // Verify all returned topics have score >= 10
        response.body.results.forEach((result: { trending_score: number }) => {
          expect(result.trending_score).toBeGreaterThanOrEqual(10)
        })
      }, 30_000)

      it('should support after cursor for pagination', async () => {
        // Create multiple trending topics in parallel — each dataset is independent.
        const datasets = await Promise.all(
          Array.from({ length: 3 }, (_, i) =>
            createTrendingTopicData({
              postTagCount: 3 - i,
              rssItemTagCount: 1,
              netVote: 1,
            }),
          ),
        )
        for (const { topicId, feedId, userId } of datasets) {
          testIds.push(feedId, topicId, userId)
        }

        const request = createRequest()

        // Get first page
        const response1 = await request.get('/api/v1/trending-topics?limit=2').expect(200)
        expect(response1.body.results).toHaveLength(2)
        expect(response1.body.page_info.end_cursor).toBeDefined()

        // Get second page using cursor
        const cursor = response1.body.page_info.end_cursor
        const response2 = await request
          .get(`/api/v1/trending-topics?limit=2&after=${cursor}`)
          .expect(200)

        expect(response2.body.results).toBeDefined()
        // Results should be different from first page
        const firstPageIds = response1.body.results.map((r: { id: string }) => r.id)
        const secondPageIds = response2.body.results.map((r: { id: string }) => r.id)
        expect(firstPageIds).not.toEqual(secondPageIds)
      })

      it('should reject invalid cursor with 400', async () => {
        const request = createRequest()

        // Invalid base64
        await request.get('/api/v1/trending-topics?after=invalid!!!').expect(400)

        // Invalid cursor format (not score:id)
        const invalidFormat = Buffer.from('justtext').toString('base64')
        await request.get(`/api/v1/trending-topics?after=${invalidFormat}`).expect(400)

        // Invalid UUID in cursor
        const invalidUUID = Buffer.from('10:not-a-uuid').toString('base64')
        await request.get(`/api/v1/trending-topics?after=${invalidUUID}`).expect(400)
      })

      it('should reject invalid time_range with 400', async () => {
        const request = createRequest()

        await request.get('/api/v1/trending-topics?time_range=invalid').expect(400)
        await request.get('/api/v1/trending-topics?time_range=').expect(400)
        await request.get('/api/v1/trending-topics?time_range=year').expect(400)
      })

      it('should reject negative min_score with 400', async () => {
        const request = createRequest()

        await request.get('/api/v1/trending-topics?min_score=-1').expect(400)
        await request.get('/api/v1/trending-topics?min_score=-100').expect(400)
      })
    })
  })
})
