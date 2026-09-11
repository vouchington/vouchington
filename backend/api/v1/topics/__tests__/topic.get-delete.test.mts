import { onceEntityListenerCompleted } from '@workers/entity-listeners/test-support'
import { describe, it, expect, afterAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  createTestUserWithAge,
  createTestTopic,
  insertTestTopic,
  relatePostToTopic,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
// Real, service-calling fixture (not the raw `@voucha/test-helpers` one) — this file waits on
// `processPostCreated` via `onceEntityListenerCompleted`, which only fires for posts created
// through the actual `createPost` write path.
import { createTestPost } from '@services/posts/test-support'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'
import { invalidate } from '@services/entity-cache'
import { onceElectionVoteStatsCompleted } from '@workers/elections/test-support'

describe('topic', () => {
  afterAll(async () => {}, 30000) // Increased timeout for cleanup when Playwright test data exists

  describe('Topic Individual Routes', () => {
    describe('GET /api/v1/topics/:idOrSlug', () => {
      it('should return a topic by ID', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-get-${random}`,
          createdById: user!.id,
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/topics/${topicId}`).expect(200)

        expect(response.body.topic.id).toBe(topicId)
        expect(response.body.topic.name).toBe(`Test Topic ${random}`)
        expect(response.body).toHaveProperty('topic_metrics')
        expect(response.body).toHaveProperty('topic_election')
        expect(response.body.topic_metrics).toHaveProperty('id', topicId)
        expect(response.body).toHaveProperty('html')
        expect(response.body).toHaveProperty('topic_categories')
        expect(Array.isArray(response.body.topic_categories)).toBe(true)
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
        )
        expect(response.headers['vary']).toContain('Cookie')
        expect(response.headers['vary']).toContain('Authorization')
      })

      it('should return a topic by slug', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const slug = `test-topic-slug-${Math.random().toString(36).slice(2, 8)}`
        const topicName = `Test Topic Slug ${random}`
        const topicId = await insertTestTopic({
          name: topicName,
          slug,
          createdById: user!.id,
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/topics/${slug}`).expect(200)

        expect(response.body.topic.id).toBe(topicId)
        expect(response.body.topic.name).toBe(topicName)
      })

      it('should return 404 for non-existent topic', async () => {
        const request = createRequest()
        await request.get('/api/v1/topics/00000000-0000-0000-0000-000000000000').expect(404)
      })

      it('returns public counts and auth-only viewer_count for restricted topic posts', async () => {
        const creator = await createTestUser()
        const viewer = await createTestUser()
        const topic = await createTestTopic({
          user: creator!,
          name: `Topic Counts ${Date.now()}`,
          topic_type: 'topic',
        })

        const publicDiscussion = await createTestPost({
          user: creator!,
          title: `Public Discussion ${Date.now()}`,
          markdown: 'public discussion',
          post_type: 'discussion',
        })
        await onceEntityListenerCompleted('processPostCreated', publicDiscussion!.id)
        await relatePostToTopic(creator!, publicDiscussion!, topic)

        const privateDiscussion = await createTestPost({
          user: creator!,
          title: `Private Discussion ${Date.now()}`,
          markdown: 'private discussion',
          post_type: 'discussion',
          broadcast: 'users',
          privacy: 'private',
        })
        await onceEntityListenerCompleted('processPostCreated', privateDiscussion!.id)
        await relatePostToTopic(creator!, privateDiscussion!, topic)
        await invalidate.topic_metrics(topic.id)

        const anonRequest = createRequest()
        const anonResponse = await anonRequest.get(`/api/v1/topics/${topic.id}`).expect(200)
        expect(anonResponse.body.topic_metrics.count.discussions).toBe(1)
        expect(anonResponse.body.topic_metrics).not.toHaveProperty('viewer_count')

        const authRequest = createRequest()
        await authRequest.authenticateAs(viewer!)
        const authResponse = await authRequest.get(`/api/v1/topics/${topic.id}`).expect(200)

        expect(authResponse.body.topic_metrics.count.discussions).toBe(1)
        expect(authResponse.body.topic_metrics.viewer_count).toEqual({
          discussions: 2,
          reviews: 0,
          'data-points': 0,
        })
        expect(authResponse.body.topic_metrics.viewer_count).not.toHaveProperty('news')
      })

      it('returns the authenticated user topic vote in the consolidated payload', async () => {
        const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Topic Vote ${random}`,
          slug: `topic-vote-${random}`,
          createdById: user!.id,
        })
        const request = createRequest()
        await request.authenticateAs(user!)

        const initial = await request.get(`/api/v1/topics/${topicId}`).expect(200)
        await request
          .put(`/api/v1/topics/${initial.body.topic.id}/vote`)
          .send({ choice: 'like' })
          .expect(204)
        await onceElectionVoteStatsCompleted(topicId)

        const response = await request.get(`/api/v1/topics/${topicId}`).expect(200)

        expect(response.body.topic_election?.votes_count_up).toBe(1)
        expect(response.body.election_vote).toMatchObject({
          entity_id: response.body.topic.id,
          user_id: user!.id,
          choice: 'like',
        })
      })
    })

    describe('DELETE /api/v1/topics/:idOrSlug', () => {
      it('returns 405 for authenticated users and does not delete the topic', async () => {
        const admin = await createTestUser({ administrator: true })

        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `To Delete ${random}`,
          slug: `to-delete-${random}`,
          createdById: admin!.id,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request.delete(`/api/v1/topics/${topicId}`).expect('Allow', 'GET, PATCH').expect(405)
        await request.get(`/api/v1/topics/${topicId}`).expect(200)
      })

      it('should return 405 when not authenticated', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-delete-401-${random}`,
          createdById: user!.id,
        })
        const request = createRequest()
        await request.delete(`/api/v1/topics/${topicId}`).expect('Allow', 'GET, PATCH').expect(405)
      })

      it('should return 405 when user is authenticated but not admin', async () => {
        const creator = await createTestUser()
        const otherUser = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-delete-403-${random}`,
          createdById: creator!.id,
        })
        const request = createRequest()
        await request.authenticateAs(otherUser!)

        await request.delete(`/api/v1/topics/${topicId}`).expect('Allow', 'GET, PATCH').expect(405)
      })
    })

    describe('removed routes', () => {
      it('returns 404 for GET /api/v1/topics/:idOrSlug/metrics', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-metrics-${random}`,
          createdById: user!.id,
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/metrics`).expect(404)
      })
    })
  })
})
