import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestPost,
  createTestUserWithAge,
  assertValidIsoDateString,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('posts.date-validation', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  describe('Post API date validation', () => {
    it('should return valid ISO date strings for all posts in GET /api/v1/posts', async () => {
      const postId = await insertTestPost({
        title: `Date Validation Post ${Date.now()}`,
        slug: `date-validation-${Date.now()}`,
        createdById: user.id,
        markdown: 'Testing date validity',
      })

      const request = createRequest()
      const response = await request.get(`/api/v1/posts?creator=${user.id}`).expect(200)

      expect(response.body.results.length).toBeGreaterThan(0)

      for (const result of response.body.results) {
        const post = response.body.posts[result.id]
        expect(post).toBeDefined()
        assertValidIsoDateString(post.created_at, `posts[${result.id}].created_at`)
        assertValidIsoDateString(post.updated_at, `posts[${result.id}].updated_at`)
      }

      // Verify created post specifically
      const post = response.body.posts[postId]
      expect(post).toBeDefined()
      assertValidIsoDateString(post.created_at, 'created post.created_at')
      assertValidIsoDateString(post.updated_at, 'created post.updated_at')
    })

    it('should return valid ISO date strings in POST /api/v1/posts response', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post('/api/v1/posts')
        .send({
          post_type: 'discussion',
          title: `Date Validation Create ${Date.now()}`,
          markdown: 'Testing date in create response',
        })
        .expect(201)

      assertValidIsoDateString(response.body.post.created_at, 'created post.created_at')
      assertValidIsoDateString(response.body.post.updated_at, 'created post.updated_at')
    })

    it('should return valid ISO date strings for a single post GET', async () => {
      const postId = await insertTestPost({
        title: `Single Date ${Date.now()}`,
        slug: `single-date-${Date.now()}`,
        createdById: user.id,
        markdown: 'Single post date validation',
      })
      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

      assertValidIsoDateString(response.body.post.created_at, 'post.created_at')
      assertValidIsoDateString(response.body.post.updated_at, 'post.updated_at')
    })

    it('should return valid ISO date strings for comments in descendants', async () => {
      const parentId = await insertTestPost({
        title: `Parent Date Test ${Date.now()}`,
        slug: `parent-date-test-${Date.now()}`,
        createdById: user.id,
        markdown: 'Parent post',
      })

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/posts')
        .send({
          post_type: 'comment',
          parent_id: parentId,
          title: '',
          markdown: 'Comment date validation',
        })
        .expect(201)

      const response = await request.get(`/api/v1/posts/${parentId}/descendants`).expect(200)
      expect(response.body.results.length).toBeGreaterThan(0)

      for (const result of response.body.results) {
        const comment = response.body.posts[result.id]
        expect(comment).toBeDefined()
        assertValidIsoDateString(comment.created_at, `comment[${result.id}].created_at`)
        assertValidIsoDateString(comment.updated_at, `comment[${result.id}].updated_at`)
      }
    })

    it('should return valid ISO date strings for post_metrics updated_at', async () => {
      await insertTestPost({
        title: `Metrics Date Test ${Date.now()}`,
        slug: `metrics-date-test-${Date.now()}`,
        createdById: user.id,
        markdown: 'Metrics date validation',
      })

      const request = createRequest()
      const response = await request.get(`/api/v1/posts?creator=${user.id}`).expect(200)
      expect(response.body.posts_metrics).toBeDefined()

      for (const [id, metrics] of Object.entries(response.body.posts_metrics)) {
        const m = metrics as Record<string, unknown>
        if (m.updated_at) {
          assertValidIsoDateString(m.updated_at, `posts_metrics[${id}].updated_at`)
        }
      }
    })

    it('should return valid ISO date strings for PATCH response', async () => {
      const postId = await insertTestPost({
        title: `Patch Date ${Date.now()}`,
        slug: `patch-date-${Date.now()}`,
        createdById: user.id,
        markdown: 'Original content',
      })
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .patch(`/api/v1/posts/${postId}`)
        .send({ broadcast: 'everyone' })
        .expect(200)

      assertValidIsoDateString(response.body.post.created_at, 'patched post.created_at')
      assertValidIsoDateString(response.body.post.updated_at, 'patched post.updated_at')
    })
  })
})
