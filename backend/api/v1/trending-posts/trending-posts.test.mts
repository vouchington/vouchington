import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { insertScoredPostTopicCategoryRelation } from '@voucha/test-helpers/entities/entity-relations-posts'
import { createTrendingPostData } from '@voucha/test-helpers/entities/trending-posts'
import { createTestStoryMembers } from '@voucha/test-helpers/entities/story-member-pages'
import { createPostStory } from '@services/stories/update'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { VALID_TRENDING_POST_TYPES, VALID_TRENDING_TIME_RANGES } from '@ts-shared/feed-capabilities'

describe('trending-posts', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  describe('Trending Posts API Routes', () => {
    describe('GET /api/v1/trending-posts', () => {
      it('should return a list of trending posts', async () => {
        await createTrendingPostData({ votesScoreUp: 2 })

        const request = createRequest()
        const response = await request.get('/api/v1/trending-posts').expect(200)

        expect(response.body).toHaveProperty('posts')
        expect(response.body).toHaveProperty('posts_metrics')
        expect(response.body).toHaveProperty('post_elections')
        expect(response.body).toHaveProperty('results')
        expect(response.body).toHaveProperty('page_info')
        expect(typeof response.body.posts).toBe('object')
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )
      })

      it('should return posts as objects (streaming pattern)', async () => {
        const namespace = randomUUID()
        const topicId = await insertTestTopic({
          name: `Trending ${namespace}`,
          slug: `trending-${namespace}`,
          createdById: admin.id,
        })
        const { postId } = await createTrendingPostData({ votesScoreUp: 2 })
        await insertScoredPostTopicCategoryRelation(postId, topicId, admin.id)

        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request
          .get(`/api/v1/trending-posts?limit=100&min_score=1&topic_id=${topicId}`)
          .expect(200)

        // Streaming pattern: posts and posts_metrics are objects, not arrays
        expect(typeof response.body.posts).toBe('object')
        expect(Array.isArray(response.body.posts)).toBe(false)
        expect(typeof response.body.posts_metrics).toBe('object')
        expect(Array.isArray(response.body.posts_metrics)).toBe(false)
        expect(typeof response.body.post_elections).toBe('object')
        expect(Array.isArray(response.body.post_elections)).toBe(false)
        // results should still be an array
        expect(Array.isArray(response.body.results)).toBe(true)

        expect(response.body.posts[postId]).toBeDefined()
        expect(response.body.results.map((row: { id: string }) => row.id)).toEqual([postId])
      })

      it('should not include cache header for authenticated users', async () => {
        const request = createRequest()
        await request.authenticateAs(admin)
        const response = await request.get('/api/v1/trending-posts').expect(200)

        expect(response.headers['cache-control']).toBeUndefined()
      })

      it('should support pagination with limit', async () => {
        const namespace = randomUUID()
        const topicId = await insertTestTopic({
          name: `Trending ${namespace}`,
          slug: `trending-${namespace}`,
          createdById: admin.id,
        })
        const datasets = await Promise.all(
          Array.from({ length: 4 }, (_, i) => createTrendingPostData({ votesScoreUp: i + 2 })),
        )
        for (const { postId } of datasets) {
          await insertScoredPostTopicCategoryRelation(postId, topicId, admin.id)
        }

        const request = createRequest()
        const response = await request
          .get(`/api/v1/trending-posts?limit=3&topic_id=${topicId}`)
          .expect(200)

        expect(response.body.results).toHaveLength(3)
        expect(response.body.results.map((row: { id: string }) => row.id)).toEqual(
          datasets
            .toReversed()
            .slice(0, 3)
            .map(row => row.postId),
        )
        expect(response.body.page_info.has_next_page).toBe(true)
        expect(response.body.page_info.end_cursor).toBeDefined()
      })

      it('should support time_range parameter', async () => {
        const namespace = randomUUID()
        const topicId = await insertTestTopic({
          name: `Trending ${namespace}`,
          slug: `trending-${namespace}`,
          createdById: admin.id,
        })
        const { postId } = await createTrendingPostData({ votesScoreUp: 2 })
        await insertScoredPostTopicCategoryRelation(postId, topicId, admin.id)
        const request = createRequest()
        for (const timeRange of VALID_TRENDING_TIME_RANGES) {
          const response = await request
            .get(`/api/v1/trending-posts?time_range=${timeRange}`)
            .expect(200)

          expect(response.body.results).toBeDefined()
          expect(response.body.page_info).toBeDefined()
          const owned = await request
            .get('/api/v1/trending-posts')
            .query({ time_range: timeRange, topic_id: topicId })
            .expect(200)
          expect(owned.body.results.map((row: { id: string }) => row.id)).toEqual([postId])
        }
      })

      it('should support post_type parameter', async () => {
        const namespace = randomUUID()
        const topicId = await insertTestTopic({
          name: `Trending ${namespace}`,
          slug: `trending-${namespace}`,
          createdById: admin.id,
        })
        const request = createRequest()
        for (const postType of VALID_TRENDING_POST_TYPES) {
          const { postId } = await createTrendingPostData({ votesScoreUp: 2, postType })
          if (postType === 'story') {
            const { story } = await createTestStoryMembers(2)
            await createPostStory(postId, story.id, admin.id)
          }
          await insertScoredPostTopicCategoryRelation(postId, topicId, admin.id)
          const response = await request
            .get(`/api/v1/trending-posts?post_type=${postType}`)
            .expect(200)

          expect(response.body.results).toBeDefined()
          const owned = await request
            .get('/api/v1/trending-posts')
            .query({ post_type: postType, topic_id: topicId })
            .expect(200)
          expect(owned.body.results.map((row: { id: string }) => row.id)).toEqual([postId])
        }
      })

      it('should support topic_id parameter', async () => {
        const request = createRequest()
        // Use a well-formed UUID that produces no results
        const response = await request
          .get('/api/v1/trending-posts?topic_id=00000000-0000-7000-8000-000000000000')
          .expect(200)

        expect(response.body.results).toBeDefined()
        expect(Array.isArray(response.body.results)).toBe(true)
        const namespace = randomUUID()
        const topicId = await insertTestTopic({
          name: `Trending ${namespace}`,
          slug: `trending-${namespace}`,
          createdById: admin.id,
        })
        const { postId } = await createTrendingPostData({ votesScoreUp: 2 })
        await insertScoredPostTopicCategoryRelation(postId, topicId, admin.id)
        const owned = await request
          .get('/api/v1/trending-posts')
          .query({ topic_id: topicId })
          .expect(200)
        expect(owned.body.results.map((row: { id: string }) => row.id)).toEqual([postId])
      })

      it('should support min_score parameter', async () => {
        const namespace = randomUUID()
        const topicId = await insertTestTopic({
          name: `Trending ${namespace}`,
          slug: `trending-${namespace}`,
          createdById: admin.id,
        })
        const { postId } = await createTrendingPostData({ votesScoreUp: 11 })
        await insertScoredPostTopicCategoryRelation(postId, topicId, admin.id)
        const { postId: belowThresholdId } = await createTrendingPostData({ votesScoreUp: 1 })
        await insertScoredPostTopicCategoryRelation(belowThresholdId, topicId, admin.id)

        const request = createRequest()
        const response = await request.get('/api/v1/trending-posts?min_score=10').expect(200)

        expect(response.body.results).toBeDefined()
        const owned = await request
          .get('/api/v1/trending-posts')
          .query({ min_score: 10, topic_id: topicId })
          .expect(200)
        expect(owned.body.results.map((row: { id: string }) => row.id)).toEqual([postId])
      }, 30_000)

      it('should support after cursor for pagination', async () => {
        const namespace = randomUUID()
        const topicId = await insertTestTopic({
          name: `Trending ${namespace}`,
          slug: `trending-${namespace}`,
          createdById: admin.id,
        })
        const datasets = await Promise.all(
          Array.from({ length: 3 }, (_, i) => createTrendingPostData({ votesScoreUp: 3 - i })),
        )
        for (const { postId } of datasets) {
          await insertScoredPostTopicCategoryRelation(postId, topicId, admin.id)
        }

        const request = createRequest()
        await request.authenticateAs(admin)

        const response1 = await request
          .get(`/api/v1/trending-posts?limit=2&topic_id=${topicId}`)
          .expect(200)
        expect(response1.body.results).toHaveLength(2)
        expect(response1.body.page_info.end_cursor).toBeDefined()

        const cursor = response1.body.page_info.end_cursor
        const response2 = await request
          .get(`/api/v1/trending-posts?limit=2&after=${cursor}&topic_id=${topicId}`)
          .expect(200)

        expect(response2.body.results).toBeDefined()
        const firstPageIds = response1.body.results.map((r: { id: string }) => r.id)
        const secondPageIds = response2.body.results.map((r: { id: string }) => r.id)
        expect(firstPageIds).not.toEqual(secondPageIds)
        expect(firstPageIds).toEqual(datasets.slice(0, 2).map(row => row.postId))
        expect(secondPageIds).toEqual([datasets[2]!.postId])
        expect(secondPageIds.filter((id: string) => firstPageIds.includes(id))).toEqual([])
      })

      it('should reject invalid cursor with 400', async () => {
        const request = createRequest()

        await request.get('/api/v1/trending-posts?after=invalid!!!').expect(400)

        const invalidFormat = Buffer.from('justtext').toString('base64')
        await request.get(`/api/v1/trending-posts?after=${invalidFormat}`).expect(400)
      })

      it('should reject invalid time_range with 400', async () => {
        const request = createRequest()

        await request.get('/api/v1/trending-posts?time_range=invalid').expect(400)
        await request.get('/api/v1/trending-posts?time_range=year').expect(400)
      })

      it('should reject invalid post_type with 400', async () => {
        const request = createRequest()

        await request.get('/api/v1/trending-posts?post_type=comment').expect(400)
        await request.get('/api/v1/trending-posts?post_type=invalid').expect(400)
      })

      it('should reject invalid topic_id with 400', async () => {
        const request = createRequest()

        await request.get('/api/v1/trending-posts?topic_id=not-a-uuid').expect(400)
      })

      it('should reject negative min_score with 400', async () => {
        const request = createRequest()

        await request.get('/api/v1/trending-posts?min_score=-1').expect(400)
      })
    })
  })
})
