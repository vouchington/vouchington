import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestPost,
  createTestUser,
  createRandomString,
  getPostLockedFields,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('POST/DELETE /api/v1/posts/:idOrSlug/lock', () => {
  let admin: PrivateUser
  let author: PrivateUser
  let stranger: PrivateUser
  let postId: string

  function makeSlug() {
    return `lock-route-${createRandomString(8)}`
  }

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    author = await createTestUser()
    stranger = await createTestUser()
    postId = await insertTestPost({
      title: 'Lock route test post',
      slug: makeSlug(),
      createdById: author.id,
      markdown: 'Post for lock route tests.',
    })
  })

  describe('POST /lock (lock)', () => {
    it('returns 401 when unauthenticated', async () => {
      const postForAnon = await insertTestPost({
        title: 'Lock anon test',
        slug: makeSlug(),
        createdById: author.id,
        markdown: 'content',
      })
      await createRequest().post(`/api/v1/posts/${postForAnon}/lock`).expect(401)
    })

    it('returns 403 when called by a non-author non-mod user', async () => {
      const request = createRequest()
      await request.authenticateAs(stranger)
      await request.post(`/api/v1/posts/${postId}/lock`).expect(403)
    })

    it('returns 204 and locks the post as the author', async () => {
      const targetPostId = await insertTestPost({
        title: 'Author lock test',
        slug: makeSlug(),
        createdById: author.id,
        markdown: 'content',
      })

      const request = createRequest()
      await request.authenticateAs(author)
      await request.post(`/api/v1/posts/${targetPostId}/lock`).expect(204)

      const fields = await getPostLockedFields(targetPostId)
      expect(fields?.locked_at).not.toBeNull()
      expect(fields?.locked_by_id).toBe(author.id)
    })

    it('returns 204 and locks the post as an admin', async () => {
      const targetPostId = await insertTestPost({
        title: 'Admin lock test',
        slug: makeSlug(),
        createdById: author.id,
        markdown: 'content',
      })

      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post(`/api/v1/posts/${targetPostId}/lock`).expect(204)

      const fields = await getPostLockedFields(targetPostId)
      expect(fields?.locked_at).not.toBeNull()
    })

    it('returns 404 for a non-existent post', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/posts/00000000-0000-7000-8000-000000000001/lock').expect(404)
    })
  })

  describe('DELETE /lock (unlock)', () => {
    it('returns 401 when unauthenticated', async () => {
      await createRequest().delete(`/api/v1/posts/${postId}/lock`).expect(401)
    })

    it('returns 403 when called by a non-author non-mod user', async () => {
      const request = createRequest()
      await request.authenticateAs(stranger)
      await request.delete(`/api/v1/posts/${postId}/lock`).expect(403)
    })

    it('returns 204 and unlocks a locked post as the author', async () => {
      const targetPostId = await insertTestPost({
        title: 'Author unlock test',
        slug: makeSlug(),
        createdById: author.id,
        markdown: 'content',
      })

      const lockRequest = createRequest()
      await lockRequest.authenticateAs(admin)
      await lockRequest.post(`/api/v1/posts/${targetPostId}/lock`).expect(204)

      const unlockRequest = createRequest()
      await unlockRequest.authenticateAs(author)
      await unlockRequest.delete(`/api/v1/posts/${targetPostId}/lock`).expect(204)

      const fields = await getPostLockedFields(targetPostId)
      expect(fields?.locked_at).toBeNull()
    })
  })

  describe('reply enforcement', () => {
    it('rejects a comment on a locked post via POST /api/v1/posts with POST_THREAD_LOCKED', async () => {
      const rootPostId = await insertTestPost({
        title: 'Root post to lock for reply enforcement',
        slug: makeSlug(),
        createdById: author.id,
        markdown: 'content',
      })

      const lockRequest = createRequest()
      await lockRequest.authenticateAs(author)
      await lockRequest.post(`/api/v1/posts/${rootPostId}/lock`).expect(204)

      // Use admin to bypass contribution gating so the lock check is reached
      const commentRequest = createRequest()
      await commentRequest.authenticateAs(admin)
      const response = await commentRequest
        .post('/api/v1/posts')
        .send({
          post_type: 'comment',
          parent_id: rootPostId,
          markdown: 'blocked comment',
          cf_turnstile_response: 'test-bypass',
        })
        .expect(403)

      expect(response.body).toMatchObject({ code: 'POST_THREAD_LOCKED' })
    })
  })

  describe('community moderator', () => {
    it('community moderator can lock a post in their community', async () => {
      const moderator = await createTestUser()
      const postAuthor = await createTestUser()
      const community = await insertTestCommunity({ createdById: admin.id })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      })
      const communityPostId = await insertTestPost({
        title: 'Community post to lock',
        slug: makeSlug(),
        createdById: postAuthor.id,
        markdown: 'content',
        communityId: community.id,
      })
      // Community posts require an approved community_post_review to be visible
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId: communityPostId,
        submittedById: postAuthor.id,
      })

      const request = createRequest()
      await request.authenticateAs(moderator)
      await request.post(`/api/v1/posts/${communityPostId}/lock`).expect(204)

      const fields = await getPostLockedFields(communityPostId)
      expect(fields?.locked_at).not.toBeNull()
      expect(fields?.locked_by_id).toBe(moderator.id)
    })
  })

  describe('idempotency', () => {
    it('POST /lock twice returns 204 both times (idempotent)', async () => {
      const targetPostId = await insertTestPost({
        title: 'Idempotent lock test',
        slug: makeSlug(),
        createdById: author.id,
        markdown: 'content',
      })

      const r1 = createRequest()
      await r1.authenticateAs(author)
      await r1.post(`/api/v1/posts/${targetPostId}/lock`).expect(204)

      const r2 = createRequest()
      await r2.authenticateAs(author)
      await r2.post(`/api/v1/posts/${targetPostId}/lock`).expect(204)

      const fields = await getPostLockedFields(targetPostId)
      expect(fields?.locked_at).not.toBeNull()
    })

    it('DELETE /lock twice returns 204 both times (idempotent)', async () => {
      const targetPostId = await insertTestPost({
        title: 'Idempotent unlock test',
        slug: makeSlug(),
        createdById: author.id,
        markdown: 'content',
      })

      const lockReq = createRequest()
      await lockReq.authenticateAs(author)
      await lockReq.post(`/api/v1/posts/${targetPostId}/lock`).expect(204)

      const r1 = createRequest()
      await r1.authenticateAs(author)
      await r1.delete(`/api/v1/posts/${targetPostId}/lock`).expect(204)

      const r2 = createRequest()
      await r2.authenticateAs(author)
      await r2.delete(`/api/v1/posts/${targetPostId}/lock`).expect(204)

      const fields = await getPostLockedFields(targetPostId)
      expect(fields?.locked_at).toBeNull()
    })
  })

  describe('anonymous masking', () => {
    it('GET post detail masks locked_by_id on locked anonymous posts for non-admins', async () => {
      const anonAuthor = await createTestUser()
      const anonPostId = await insertTestPost({
        title: 'Anonymous locked post',
        slug: makeSlug(),
        createdById: anonAuthor.id,
        markdown: 'content',
        isAnonymous: true,
      })

      // Author locks their own anonymous post
      const lockReq = createRequest()
      await lockReq.authenticateAs(anonAuthor)
      await lockReq.post(`/api/v1/posts/${anonPostId}/lock`).expect(204)

      // Stranger views the post — locked_by_id should be masked
      const getReq = createRequest()
      await getReq.authenticateAs(stranger)
      const response = await getReq.get(`/api/v1/posts/${anonPostId}`).expect(200)
      expect(response.body.post.locked_at).not.toBeNull()
      expect(response.body.post.locked_by_id).toBeNull()
    })
  })
})
