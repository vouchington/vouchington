import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestRssFeed,
  insertTestTopic,
  createTestUser,
  updateRssFeedTiming,
} from '@voucha/test-helpers'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { createTopicAliases } from '@services/topics/aliases'

describe('topics', () => {
  describe('Topics Collection Routes', () => {
    let user: PrivateUser

    let admin: PrivateUser

    beforeAll(async () => {
      user = await createTestUser({ administrator: true })
      admin = user // In this file, user needs admin permissions for some tests
    })

    describe('GET /api/v1/topics', () => {
      it('should return a list of topics', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-${random}`,
          createdById: user.id,
        })
        const request = createRequest()
        const response = await request.get('/api/v1/topics').expect(200)

        expect(response.body).toHaveProperty('topics')
        expect(response.body).toHaveProperty('topics_metrics')
        expect(response.body).toHaveProperty('results')
        expect(response.body).toHaveProperty('page_info')
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )
      })

      it('should return topics as objects (streaming pattern)', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic for Streaming ${random}`,
          slug: `test-topic-streaming-${random}`,
          createdById: user.id,
        })
        // Use an authenticated request to bypass the Valkey search cache (which caches
        // anon results for 60s) so the newly created topic appears in the response.
        // Filter by the unique random suffix to avoid dirty-DB result-set overflow.
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .get(`/api/v1/topics?q=Test+Topic+for+Streaming+${random}`)
          .expect(200)

        // Streaming pattern: topics and topics_metrics are objects, not arrays
        expect(typeof response.body.topics).toBe('object')
        expect(Array.isArray(response.body.topics)).toBe(false)
        expect(typeof response.body.topics_metrics).toBe('object')
        expect(Array.isArray(response.body.topics_metrics)).toBe(false)
        // results should still be an array
        expect(Array.isArray(response.body.results)).toBe(true)

        // Only verify our specific topic to avoid race conditions from parallel tests:
        // topics API has no user filter, so other tests' topics may appear in results
        // and be deleted mid-flight by their afterAll cleanup.
        expect(response.body.topics[topicId]).toBeDefined()
        expect(response.body.topics_metrics[topicId]).toBeDefined()
      })

      it('should filter topics by exact slugs', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const firstSlug = `slug-filter-first-${random}`
        const secondSlug = `slug-filter-second-${random}`
        const excludedSlug = `slug-filter-excluded-${random}`
        const firstId = await insertTestTopic({
          name: `Slug Filter First ${random}`,
          slug: firstSlug,
          createdById: user.id,
        })
        const secondId = await insertTestTopic({
          name: `Slug Filter Second ${random}`,
          slug: secondSlug,
          createdById: user.id,
        })
        await insertTestTopic({
          name: `Slug Filter Excluded ${random}`,
          slug: excludedSlug,
          createdById: user.id,
        })

        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .get(`/api/v1/topics?slugs=${firstSlug},${secondSlug}&limit=10`)
          .expect(200)

        const resultIds = new Set(response.body.results.map((result: { id: string }) => result.id))
        expect(resultIds).toEqual(new Set([firstId, secondId]))
      })

      it('should support pagination with limit', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        // Create multiple topics
        for (let i = 0; i < 5; i++) {
          await insertTestTopic({
            name: `Pagination Topic ${random}-${i}`,
            slug: `pagination-topic-${random}-${Date.now()}-${i}`,
            createdById: user.id,
          })
        }

        const request = createRequest()
        const response = await request.get('/api/v1/topics?limit=3').expect(200)

        expect(response.body.results.length).toBeLessThanOrEqual(3)
        expect(response.body).toHaveProperty('page_info')
      })

      it('should return topic_elections as an object keyed by topic ID', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic Elections ${random}`,
          slug: `test-topic-elections-${random}`,
          createdById: user.id,
        })
        // Use authenticated request with name filter to guarantee the topic appears
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .get(`/api/v1/topics?q=Test+Topic+Elections+${random}`)
          .expect(200)

        expect(typeof response.body.topic_elections).toBe('object')
        expect(Array.isArray(response.body.topic_elections)).toBe(false)

        // Our specific topic must appear in results and have an election entry with vote fields
        expect(response.body.results.some((t: { id: string }) => t.id === topicId)).toBe(true)
        expect(response.body.topic_elections[topicId]).toBeDefined()
        expect(response.body.topic_elections[topicId]).toHaveProperty('votes_score_net')
      })

      it('should filter topics by active rss feeds', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicWithRssId = await insertTestTopic({
          name: `RSS Topic ${random}`,
          slug: `rss-topic-${random}`,
          createdById: user.id,
        })
        const rssFeedId = await insertTestRssFeed({
          topicId: topicWithRssId,
          title: `RSS Feed ${random}`,
        })
        await updateRssFeedTiming(rssFeedId, new Date())

        const topicWithoutRssId = await insertTestTopic({
          name: `No RSS Topic ${random}`,
          slug: `no-rss-topic-${random}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(admin)
        // Scope by unique random suffix to avoid dirty-DB result-set overflow
        const response = await request
          .get(`/api/v1/topics?rss_feed=true&limit=100&q=${random}`)
          .expect(200)

        expect(
          response.body.results.some((topic: { id: string }) => topic.id === topicWithRssId),
        ).toBe(true)
        expect(
          response.body.results.some((topic: { id: string }) => topic.id === topicWithoutRssId),
        ).toBe(false)
        expect(response.body.topics[topicWithRssId]).toBeDefined()
        expect(response.body.topics[topicWithoutRssId]).toBeUndefined()
      })

      it('should accept similar_topic alias filters', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const sourceTopicId = await insertTestTopic({
          name: `Source Topic ${random}`,
          slug: `source-topic-${random}`,
          createdById: user.id,
        })
        await createTopicAliases(sourceTopicId, `source-topic-alias-${random}`)

        const request = createRequest()
        const response = await request
          .get(`/api/v1/topics?similar_topic=source-topic-alias-${random}`)
          .expect(200)

        expect(response.body).toHaveProperty('results')
        expect(response.body).toHaveProperty('page_info')
      })

      it('should support pagination with end_cursor', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        await insertTestTopic({
          name: `First Topic ${random}`,
          slug: `first-topic-${random}`,
          createdById: user.id,
        })
        await insertTestTopic({
          name: `Second Topic ${random}`,
          slug: `second-topic-${random}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)
        const firstResponse = await request
          .get(`/api/v1/topics?limit=1&sort=new&q=${random}`)
          .expect(200)

        expect(firstResponse.body.results.length).toBeGreaterThan(0)
        expect(firstResponse.body.page_info.end_cursor).toBeTruthy()

        const cursor = firstResponse.body.page_info.end_cursor
        const secondResponse = await request
          .get(`/api/v1/topics?limit=1&sort=new&q=${random}&after=${encodeURIComponent(cursor)}`)
          .expect(200)

        expect(secondResponse.body.results.length).toBeGreaterThan(0)
        expect(secondResponse.body.results[0].id).not.toBe(firstResponse.body.results[0].id)
      })

      it('should support pagination with after cursor', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Topic for ID cursor ${random}`,
          slug: `topic-id-cursor-${random}`,
          createdById: user.id,
        })
        // Encode cursor for the topic
        const cursor = Buffer.from(JSON.stringify({ id: topicId })).toString('base64')

        const request = createRequest()
        const response = await request.get(`/api/v1/topics?after=${cursor}`).expect(200)

        // Should not include the topic with the given ID (cursor is exclusive)
        const foundTopic = response.body.results.find((t: { id: string }) => t.id === topicId)
        expect(foundTopic).toBeUndefined()
      })
    })
  })
})
