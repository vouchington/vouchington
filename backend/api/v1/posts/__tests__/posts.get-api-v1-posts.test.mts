import { randomUUID } from 'node:crypto'

import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'

import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

import type { PrivateUser } from '@services/users/types'

import { createTopicAliases } from '@services/topics/aliases'

const uniqueSlug = (prefix: string) => `${prefix}-${randomUUID()}`

describe('posts', () => {
  describe('Posts Collection Routes', () => {
    let user: PrivateUser

    let admin: PrivateUser

    let viewer: PrivateUser
    void (0 as unknown as typeof viewer)

    beforeAll(async () => {
      user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      admin = await createTestUser({ administrator: true })
      viewer = await createTestUser()
    })

    describe('GET /api/v1/posts', () => {
      it('should return a list of posts', async () => {
        await insertTestPost({
          title: 'Test Post',
          slug: uniqueSlug('test-post'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        const response = await request.get('/api/v1/posts').expect(200)

        expect(response.body).toHaveProperty('posts')
        expect(response.body).toHaveProperty('posts_metrics')
        expect(response.body).toHaveProperty('results')
        expect(response.body).toHaveProperty('page_info')
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
        )
      })

      it('should return posts as objects (streaming pattern)', async () => {
        await insertTestPost({
          title: 'Test Post for Streaming',
          slug: uniqueSlug('test-post-streaming'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        // Filter by creator to avoid interference from parallel tests creating/deleting posts
        const response = await request.get(`/api/v1/posts?creator=${user!.id}`).expect(200)

        // Streaming pattern: posts, posts_metrics are objects, not arrays
        expect(typeof response.body.posts).toBe('object')
        expect(Array.isArray(response.body.posts)).toBe(false)
        expect(typeof response.body.posts_metrics).toBe('object')
        expect(Array.isArray(response.body.posts_metrics)).toBe(false)
        // results should still be an array
        expect(Array.isArray(response.body.results)).toBe(true)

        // Verify that posts are keyed by ID
        const resultIds = response.body.results.map((r: { id: string }) => r.id)
        expect(resultIds.length).toBeGreaterThan(0)
        resultIds.forEach((id: string) => {
          expect(response.body.posts[id]).toBeDefined()
          expect(response.body.posts_metrics[id]).toBeDefined()
        })
      })

      it('should support filtering by creator username', async () => {
        const creator = await createTestUser()
        const username = creator?.username
        expect(username).toBeTruthy()

        const postId = await insertTestPost({
          title: 'Username Creator Filter Post',
          slug: uniqueSlug('creator-username-post'),
          createdById: creator!.id,
          markdown: 'Creator filter content',
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/posts?creator=${username}`).expect(200)
        const resultIds = response.body.results.map((r: { id: string }) => r.id)

        expect(resultIds).toContain(postId)
      })

      it('should support filtering reviews by topic alias', async () => {
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Review Topic ${random}`,
          slug: `review-topic-${random}`,
          createdById: admin.id,
        })
        const alias = `review-topic-alias-${random}`
        await createTopicAliases(topicId, alias)

        const reviewPostId = await insertTestPost({
          postType: 'review',
          title: `Review Post ${random}`,
          slug: `review-post-${random}`,
          createdById: user.id,
          markdown: 'review markdown',
        })
        await insertTestPostReview(reviewPostId, topicId, 5)

        const request = createRequest()
        const response = await request
          .get(`/api/v1/posts?post_types=review&review_topic=${alias}`)
          .expect(200)
        const resultIds = response.body.results.map((r: { id: string }) => r.id)
        expect(resultIds).toContain(reviewPostId)
      })

      it('should support pagination with limit', async () => {
        // Create multiple posts
        for (let i = 0; i < 5; i++) {
          await insertTestPost({
            title: `Pagination Post ${i}`,
            slug: uniqueSlug(`pagination-post-${i}`),
            createdById: user!.id,
            markdown: `Content ${i}`,
          })
        }

        const request = createRequest()
        const response = await request.get('/api/v1/posts?limit=3').expect(200)

        expect(response.body.results.length).toBeLessThanOrEqual(3)
        expect(response.body).toHaveProperty('page_info')
      })

      it('should support pagination with end_cursor', async () => {
        const paginationUser = await createTestUser()
        const baseMs = Date.now() - 1000
        // Create first post
        const firstPostId = await insertTestPost({
          title: 'First Post',
          slug: uniqueSlug('first-post'),
          createdById: paginationUser.id,
          markdown: 'First content',
          createdAt: new Date(baseMs),
        })

        // Create second post
        const secondPostId = await insertTestPost({
          title: 'Second Post',
          slug: uniqueSlug('second-post'),
          createdById: paginationUser.id,
          markdown: 'Second content',
          createdAt: new Date(baseMs + 1000),
        })
        const request = createRequest()
        const firstResponse = await request
          .get(`/api/v1/posts?limit=1&sort=new&creator=${paginationUser.id}`)
          .expect(200)

        expect(firstResponse.body.results.length).toBeGreaterThan(0)
        expect(firstResponse.body.results[0].id).toBe(secondPostId)
        expect(firstResponse.body.page_info.end_cursor).toBeTruthy()

        const cursor = firstResponse.body.page_info?.end_cursor
        expect(cursor).toBeTruthy()
        const secondResponse = await request
          .get(`/api/v1/posts?limit=1&sort=new&after=${cursor}`)
          .query({ creator: paginationUser.id })
          .expect(200)

        expect(secondResponse.body.results.length).toBeGreaterThan(0)
        expect(firstResponse.body.results.length).toBeGreaterThan(0)
        expect(secondResponse.body.results[0].id).toBe(firstPostId)
      })

      it('should support pagination with after cursor for drafts', async () => {
        const postId = await insertTestPost({
          title: 'Draft Post for ID cursor',
          slug: uniqueSlug('draft-post-id-cursor'),
          createdById: user!.id,
          markdown: 'Draft content',
        })
        // Encode cursor for the post
        const cursor = Buffer.from(JSON.stringify({ id: postId })).toString('base64')

        const request = createRequest()
        const response = await request.get(`/api/v1/posts?drafts=true&after=${cursor}`).expect(200)

        // Should not include the post with the given ID (cursor is exclusive)
        const foundPost = response.body.results.find((p: { id: string }) => p.id === postId)
        expect(foundPost).toBeUndefined()
      })

      it('should always return objects for posts and posts_metrics', async () => {
        const request = createRequest()
        const response = await request.get(`/api/v1/posts?limit=1&creator=${user!.id}`).expect(200)

        // Verify streaming pattern: always objects, never arrays
        expect(typeof response.body.posts).toBe('object')
        expect(Array.isArray(response.body.posts)).toBe(false)
        expect(typeof response.body.posts_metrics).toBe('object')
        expect(Array.isArray(response.body.posts_metrics)).toBe(false)
        expect(Array.isArray(response.body.results)).toBe(true)
        expect(response.body.page_info).toHaveProperty('has_next_page')

        // Verify all results are in the posts object
        expect(response.body.results.length).toBeGreaterThan(0)
        response.body.results.forEach((result: { id: string }) => {
          expect(response.body.posts[result.id]).toBeDefined()
        })
      })

      it('should handle large datasets with streaming pattern', async () => {
        // Use a dedicated creator and filter by it so this test's assertions cover all ten
        // fixtures specifically, regardless of what else exists in the shared, dirty database —
        // an unfiltered `limit=10` request can return unrelated posts, and requiring only one
        // result means the test still passes if all ten `postIds` are omitted or the endpoint
        // incorrectly caps the page at one. Authenticate as the creator: anonymous list requests
        // go through a cached search that a fresh insert may not yet be reflected in (see the
        // post_elections test above), while an authenticated request queries the DB directly.
        const datasetUser = await createTestUser()
        const postIds: string[] = []
        for (let i = 0; i < 10; i++) {
          const postId = await insertTestPost({
            title: `Large Dataset Post ${i}`,
            slug: uniqueSlug(`large-dataset-${i}`),
            createdById: datasetUser.id,
            markdown: `Content for post ${i}`,
          })
          postIds.push(postId)
        }

        const request = createRequest()
        await request.authenticateAs(datasetUser)
        const response = await request
          .get(`/api/v1/posts?creator=${datasetUser.id}&limit=10`)
          .expect(200)

        // Verify all created posts are in the response as objects
        expect(typeof response.body.posts).toBe('object')
        expect(typeof response.body.posts_metrics).toBe('object')
        expect(Array.isArray(response.body.results)).toBe(true)

        // All ten fixture posts come back, not just an overlapping subset.
        const resultIds = response.body.results.map((result: { id: string }) => result.id)
        expect(new Set(resultIds)).toEqual(new Set(postIds))
        response.body.results.forEach((result: { id: string }) => {
          expect(response.body.posts[result.id]).toBeDefined()
          expect(response.body.posts_metrics[result.id]).toBeDefined()
        })
      })

      it('should return post_elections as an object in the posts list response', async () => {
        const postId = await insertTestPost({
          title: 'Test Post for Elections',
          slug: uniqueSlug('test-post-elections'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        await request.authenticateAs(user!)
        const response = await request.get(`/api/v1/posts?creator=${user!.id}`).expect(200)

        expect(typeof response.body.post_elections).toBe('object')
        expect(Array.isArray(response.body.post_elections)).toBe(false)

        // Authenticated requests use direct DB query, so the newly created post is always in results
        const foundResult = response.body.results.find((r: { id: string }) => r.id === postId)
        expect(foundResult).toBeDefined()
        expect(response.body.post_elections[postId]).toHaveProperty('votes_score_net')
      })
    })
  })
  // keep generated shard bindings live for typecheck
})
