import { describe, expect, it, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import { insertTestPost, createTestUser, createRandomString } from '@voucha/test-helpers'
import { getPostByAnyCached } from '@services/entity-fetch'

describe('post.archive', () => {
  let creator: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    ;[creator, otherUser] = await Promise.all([createTestUser(), createTestUser()])
  })

  function makeSlug() {
    return `post-archive-api-${createRandomString(8)}`
  }

  describe('PATCH /api/v1/posts/:idOrSlug archive', () => {
    it('archives the post for the creator', async () => {
      const postId = await insertTestPost({
        title: 'Archive API Creator Test',
        slug: makeSlug(),
        createdById: creator.id,
        markdown: 'content',
      })

      const request = createRequest()
      await request.authenticateAs(creator)
      const res = await request.patch(`/api/v1/posts/${postId}`).send({ archive: true }).expect(200)
      expect(res.body.post.archived_at).not.toBeNull()
    })

    it('invalidates cached post details after archiving', async () => {
      const slug = makeSlug()
      const postId = await insertTestPost({
        title: 'Archive API Cache Test',
        slug,
        createdById: creator.id,
        markdown: 'content',
      })

      expect((await getPostByAnyCached(postId))?.archived_at).toBeNull()
      expect((await getPostByAnyCached(slug))?.archived_at).toBeNull()

      const request = createRequest()
      await request.authenticateAs(creator)
      await request.patch(`/api/v1/posts/${slug}`).send({ archive: true }).expect(200)

      expect((await getPostByAnyCached(postId))?.archived_at).not.toBeNull()
      expect((await getPostByAnyCached(slug))?.archived_at).not.toBeNull()
    })

    it('keeps an approved public archived post available at its direct URL', async () => {
      const postId = await insertTestPost({
        title: 'Archived Direct URL Test',
        slug: makeSlug(),
        createdById: creator.id,
        markdown: 'content',
      })
      const creatorRequest = createRequest()
      await creatorRequest.authenticateAs(creator)
      await creatorRequest.patch(`/api/v1/posts/${postId}`).send({ archive: true }).expect(200)

      const response = await createRequest().get(`/api/v1/posts/${postId}`).expect(200)

      expect(response.body.post).toMatchObject({ id: postId })
      expect(response.body.post.archived_at).not.toBeNull()
    })

    it('returns 403 for a non-owner', async () => {
      const postId = await insertTestPost({
        title: 'Archive API NonOwner Test',
        slug: makeSlug(),
        createdById: creator.id,
        markdown: 'content',
      })

      const request = createRequest()
      await request.authenticateAs(otherUser)
      await request.patch(`/api/v1/posts/${postId}`).send({ archive: true }).expect(403)
    })

    it('returns 401 for unauthenticated user', async () => {
      const postId = await insertTestPost({
        title: 'Archive API Unauth Test',
        slug: makeSlug(),
        createdById: creator.id,
        markdown: 'content',
      })

      const request = createRequest()
      await request.patch(`/api/v1/posts/${postId}`).send({ archive: true }).expect(401)
    })

    it('returns 404 for non-existent post', async () => {
      const request = createRequest()
      await request.authenticateAs(creator)
      await request
        .patch('/api/v1/posts/00000000-0000-0000-0000-000000000000')
        .send({ archive: true })
        .expect(404)
    })
  })

  describe('PATCH /api/v1/posts/:idOrSlug unarchive', () => {
    it('unarchives the post for the creator', async () => {
      const postId = await insertTestPost({
        title: 'Unarchive API Creator Test',
        slug: makeSlug(),
        createdById: creator.id,
        markdown: 'content',
      })

      const request = createRequest()
      await request.authenticateAs(creator)
      await request.patch(`/api/v1/posts/${postId}`).send({ archive: true }).expect(200)
      const res = await request
        .patch(`/api/v1/posts/${postId}`)
        .send({ archive: false })
        .expect(200)
      expect(res.body.post.archived_at).toBeNull()
    })

    it('returns 403 for a non-owner', async () => {
      const postId = await insertTestPost({
        title: 'Unarchive API NonOwner Test',
        slug: makeSlug(),
        createdById: creator.id,
        markdown: 'content',
      })

      const creatorRequest = createRequest()
      await creatorRequest.authenticateAs(creator)
      await creatorRequest.patch(`/api/v1/posts/${postId}`).send({ archive: true }).expect(200)

      const otherRequest = createRequest()
      await otherRequest.authenticateAs(otherUser)
      await otherRequest.patch(`/api/v1/posts/${postId}`).send({ archive: false }).expect(403)
    })

    it('returns 401 for unauthenticated user', async () => {
      const postId = await insertTestPost({
        title: 'Unarchive API Unauth Test',
        slug: makeSlug(),
        createdById: creator.id,
        markdown: 'content',
      })

      const request = createRequest()
      await request.patch(`/api/v1/posts/${postId}`).send({ archive: false }).expect(401)
    })

    it('returns 404 for non-existent post', async () => {
      const request = createRequest()
      await request.authenticateAs(creator)
      await request
        .patch('/api/v1/posts/00000000-0000-0000-0000-000000000000')
        .send({ archive: false })
        .expect(404)
    })
  })
})
