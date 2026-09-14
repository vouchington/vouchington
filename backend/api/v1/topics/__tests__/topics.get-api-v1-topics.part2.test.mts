import { describe, it, expect, beforeAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestTopic,
  insertTestTopicBatch,
  insertTestTopicMetricsBatch,
  insertTopicElectionVote,
} from '@voucha/test-helpers'

describe('topics', () => {
  describe('Topics Collection Routes', () => {
    let user: PrivateUser

    beforeAll(async () => {
      user = await createTestUser({ administrator: true })
    })

    describe('GET /api/v1/topics', () => {
      it('should always return objects for topics and topics_metrics', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const slug = `response-shape-topic-${random}`
        const topicId = await insertTestTopic({
          name: `Response Shape Topic ${random}`,
          slug,
          createdById: user.id,
        })

        // `slugs` is an exact filter on a unique column, so this owns its result set on a dirty
        // database. Authenticate anyway to bypass the Valkey anon search cache (60s TTL).
        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request.get(`/api/v1/topics?slugs=${slug}&limit=1`).expect(200)

        // Verify streaming pattern: always objects, never arrays
        expect(typeof response.body.topics).toBe('object')
        expect(Array.isArray(response.body.topics)).toBe(false)
        expect(typeof response.body.topics_metrics).toBe('object')
        expect(Array.isArray(response.body.topics_metrics)).toBe(false)
        expect(Array.isArray(response.body.results)).toBe(true)

        // One matching row for a unique slug means there is no next page.
        expect(response.body.page_info.has_next_page).toBe(false)
        expect(response.body.page_info.end_cursor).toBeNull()

        // The owned fixture is the only result, and every result has its topic sidecar.
        expect(response.body.results.map((result: { id: string }) => result.id)).toEqual([topicId])
        response.body.results.forEach((result: { id: string }) => {
          expect(response.body.topics[result.id]).toBeDefined()
        })
      })

      it('hydrates a full authenticated 100-topic page', async () => {
        const prefix = `large-dataset-${randomUUID()}`
        const topicIds = await insertTestTopicBatch({ count: 100, createdById: user.id, prefix })
        await insertTestTopicMetricsBatch(topicIds)
        const topicSlugs = Array.from({ length: 100 }, (_, index) => `${prefix}-topic-${index + 1}`)

        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request
          .get(`/api/v1/topics?slugs=${topicSlugs.join(',')}&limit=100`)
          .expect(200)

        // Verify all created topics are in the response as objects
        expect(typeof response.body.topics).toBe('object')
        expect(typeof response.body.topics_metrics).toBe('object')
        expect(Array.isArray(response.body.results)).toBe(true)

        expect(response.body.results).toHaveLength(100)
        const resultIds = response.body.results.map((result: { id: string }) => result.id)
        expect(new Set(resultIds)).toEqual(new Set(topicIds))
        response.body.results.forEach((result: { id: string }) => {
          expect(response.body.topics[result.id]).toBeDefined()
          expect(response.body.topics_metrics[result.id]).toBeDefined()
        })
      })

      it('should include bookmarks for authenticated users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        await insertTestTopic({
          name: `Test Topic with Auth ${random}`,
          slug: `test-topic-auth-${random}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request.get('/api/v1/topics').expect(200)

        // Authenticated users should get bookmarks
        expect(response.body).toHaveProperty('topics')
        expect(response.body).toHaveProperty('topics_metrics')
        expect(response.body).toHaveProperty('results')
        expect(response.body).toHaveProperty('page_info')

        // bookmarks are present for authenticated users
        expect(typeof response.body.bookmarks).toBe('object')
      })

      it('should not return election_votes for unauthenticated requests', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        await insertTestTopic({
          name: `Anon No Vote ${random}`,
          slug: `anon-no-vote-${random}`,
          createdById: user.id,
        })
        const request = createRequest()
        const response = await request.get('/api/v1/topics').expect(200)
        expect(response.body.election_votes).toBeUndefined()
      })

      it('should return election_votes for authenticated users who have voted', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const voter = await createTestUser({ administrator: false })
        const topicId = await insertTestTopic({
          name: `Vote Topic ${random}`,
          slug: `vote-topic-${random}`,
          createdById: user.id,
        })
        await insertTopicElectionVote(voter.id, topicId, 1, undefined, false, true)

        const request = createRequest()
        await request.authenticateAs(voter)
        const response = await request.get(`/api/v1/topics?q=Vote+Topic+${random}`).expect(200)

        expect(response.body.election_votes).toBeDefined()
        expect(response.body.election_votes[topicId]).toBeDefined()
        expect(response.body.election_votes[topicId].choice).toBe('like')
        expect(response.body.election_votes[topicId].entity_id).toBe(topicId)
      })

      it('should return empty election_votes when authenticated user has no votes on page', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const nonVoter = await createTestUser({ administrator: false })
        await insertTestTopic({
          name: `Unvoted Topic ${random}`,
          slug: `unvoted-topic-${random}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(nonVoter)
        const response = await request.get(`/api/v1/topics?q=Unvoted+Topic+${random}`).expect(200)
        expect(typeof response.body.election_votes).toBe('object')
      })

      it('should not cache responses for authenticated users', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        await insertTestTopic({
          name: `Test Topic No Cache ${random}`,
          slug: `test-topic-no-cache-${random}`,
          createdById: user.id,
        })
        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request.get('/api/v1/topics').expect(200)

        // Should not have public cache-control header for authenticated users
        expect(
          !response.headers['cache-control'] ||
            !response.headers['cache-control'].includes('public'),
        ).toBe(true)
      })

      it('should return consistent structure across multiple pages', async () => {
        // Create multiple topics for pagination
        for (let i = 0; i < 5; i++) {
          const random = Math.random().toString(36).slice(2, 8)
          await insertTestTopic({
            name: `Pagination Consistency Topic ${i} ${random}`,
            slug: `pagination-consistency-topic-${Date.now()}-${i}-${random}`,
            createdById: user.id,
          })
        }

        const request = createRequest()

        // Get first page
        const firstPage = await request.get('/api/v1/topics?limit=2').expect(200)
        expect(typeof firstPage.body.topics).toBe('object')
        expect(typeof firstPage.body.topics_metrics).toBe('object')
        expect(Array.isArray(firstPage.body.results)).toBe(true)

        // Get second page
        expect(firstPage.body.page_info.has_next_page).toBe(true)
        expect(firstPage.body.page_info.end_cursor).toBeTruthy()
        const secondPage = await request
          .get(`/api/v1/topics?limit=2&after=${firstPage.body.page_info.end_cursor}`)
          .expect(200)

        // Structure should be consistent
        expect(typeof secondPage.body.topics).toBe('object')
        expect(typeof secondPage.body.topics_metrics).toBe('object')
        expect(Array.isArray(secondPage.body.results)).toBe(true)

        // Pages should not overlap
        const firstPageIds = firstPage.body.results.map((r: { id: string }) => r.id)
        const secondPageIds = new Set(secondPage.body.results.map((r: { id: string }) => r.id))
        const overlap = firstPageIds.filter((id: string) => secondPageIds.has(id))
        expect(overlap.length).toBe(0)
      })
    })
  })
})
