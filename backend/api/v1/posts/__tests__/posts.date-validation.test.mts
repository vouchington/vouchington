import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
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
          parent_post_id: parentId,
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
