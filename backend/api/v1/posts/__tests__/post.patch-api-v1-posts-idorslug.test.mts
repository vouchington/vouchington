import { onceEntityListenerCompleted } from '@workers/entity-listeners/test-support'
import { describe, it, expect, beforeAll } from 'vitest'

import type { PrivateUser } from '@services/users/types'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestPost,
  createTestUser,
  createTestUserWithAge,
  followUser,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'

describe('post', () => {
  describe('Post Individual Routes', () => {
    let admin: PrivateUser

    let creator: PrivateUser

    let viewer: PrivateUser

    beforeAll(async () => {
      admin = await createTestUser({ administrator: true })
      creator = await createTestUser()
      viewer = await createTestUser()
      await followUser(viewer, creator)
    })

    describe('PATCH /api/v1/posts/:idOrSlug', () => {
      it('should update post when user is creator', async () => {
        const postId = await insertTestPost({
          title: 'Original Title',
          slug: `original-slug-${Date.now()}`,
          createdById: creator.id,
          markdown: 'Original content',
        })
        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .patch(`/api/v1/posts/${postId}`)
          .send({ title: 'Updated Title' })
          .expect(200)

        expect(response.body.post.title).toBe('Updated Title')
      })

      it('should update post when user is admin', async () => {
        const postId = await insertTestPost({
          title: 'Original Title',
          slug: `original-slug-admin-${Date.now()}`,
          createdById: creator.id,
          markdown: 'Original content',
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request
          .patch(`/api/v1/posts/${postId}`)
          .send({ title: 'Admin Updated Title' })
          .expect(200)

        expect(response.body.post.title).toBe('Admin Updated Title')
      })

      it('should return 401 when not authenticated', async () => {
        const postId = await insertTestPost({
          title: 'Test Post',
          slug: `test-post-patch-401-${Date.now()}`,
          createdById: creator.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        await request.patch(`/api/v1/posts/${postId}`).send({ title: 'Updated Title' }).expect(401)
      })

      it('should return 403 when user is not creator or admin', async () => {
        const otherUser = await createTestUser()
        const postId = await insertTestPost({
          title: 'Test Post',
          slug: `test-post-patch-403-${Date.now()}`,
          createdById: creator.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        await request.authenticateAs(otherUser!)

        await request.patch(`/api/v1/posts/${postId}`).send({ title: 'Updated Title' }).expect(403)
      })

      it('should allow creator to update title/markdown within 1 day', async () => {
        const postId = await insertTestPost({
          title: 'Fresh Post',
          slug: `fresh-post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Fresh content',
        })
        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .patch(`/api/v1/posts/${postId}`)
          .send({ title: 'Updated Fresh Title' })
          .expect(200)

        expect(response.body.post.title).toBe('Updated Fresh Title')
      })

      it('should return 403 when creator tries to update title after 1 day', async () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        const oldId = getMinUUIDv7ForDate(twoDaysAgo)
        const postId = await insertTestPost({
          id: oldId,
          title: 'Old Post',
          slug: `old-post-title-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Old content',
        })
        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .patch(`/api/v1/posts/${postId}`)
          .send({ title: 'Should Fail' })
          .expect(403)

        expect(response.body.code).toBe('POST_CONTENT_EDIT_WINDOW_EXPIRED')
      })

      it('should return 403 when creator tries to update markdown after 1 day', async () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        const oldId = getMinUUIDv7ForDate(twoDaysAgo)
        const postId = await insertTestPost({
          id: oldId,
          title: 'Old Post',
          slug: `old-post-md-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Old content',
        })
        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .patch(`/api/v1/posts/${postId}`)
          .send({ markdown: 'Should also fail' })
          .expect(403)

        expect(response.body.code).toBe('POST_CONTENT_EDIT_WINDOW_EXPIRED')
      })

      it('should return 403 when creator tries to update categories after 1 day', async () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        const postId = await insertTestPost({
          id: getMinUUIDv7ForDate(twoDaysAgo),
          title: 'Old category post',
          slug: `old-post-categories-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Old content',
        })
        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .patch(`/api/v1/posts/${postId}`)
          .send({ categories: [{ type: 'hashtag', hashtag: 'should-fail' }] })
          .expect(403)

        expect(response.body.code).toBe('POST_CONTENT_EDIT_WINDOW_EXPIRED')
      })

      it('should allow creator to update broadcast after 1 day', async () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        const oldId = getMinUUIDv7ForDate(twoDaysAgo)
        const postId = await insertTestPost({
          id: oldId,
          title: 'Old Post',
          slug: `old-post-broadcast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Old content',
          broadcast: 'everyone',
          privacy: 'public',
        })
        const request = createRequest()
        await request.authenticateAs(creator)

        const response = await request
          .patch(`/api/v1/posts/${postId}`)
          .send({ broadcast: 'users' })
          .expect(200)

        expect(response.body.post.broadcast).toBe('users')
      })

      it('should allow admin to update title after 1 day', async () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        const oldId = getMinUUIDv7ForDate(twoDaysAgo)
        const postId = await insertTestPost({
          id: oldId,
          title: 'Old Post',
          slug: `old-post-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Old content',
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        const response = await request
          .patch(`/api/v1/posts/${postId}`)
          .send({ title: 'Admin Override' })
          .expect(200)

        expect(response.body.post.title).toBe('Admin Override')
      })
    })

    describe('DELETE /api/v1/posts/:idOrSlug', () => {
      it('should delete post when user is creator', async () => {
        const postId = await insertTestPost({
          title: 'To Delete',
          slug: `to-delete-${Date.now()}`,
          createdById: creator.id,
          markdown: 'Will be deleted',
        })
        const request = createRequest()
        await request.authenticateAs(creator)

        await request.delete(`/api/v1/posts/${postId}`).expect(204)
        await onceEntityListenerCompleted('processPostDeleted', postId)

        // Verify it's deleted
        await request.get(`/api/v1/posts/${postId}`).expect(404)
      })

      it('should delete post when user is admin', async () => {
        const postId = await insertTestPost({
          title: 'To Delete by Admin',
          slug: `to-delete-admin-${Date.now()}`,
          createdById: creator.id,
          markdown: 'Will be deleted by admin',
        })
        const request = createRequest()
        await request.authenticateAs(admin)

        await request.delete(`/api/v1/posts/${postId}`).expect(204)
      })

      it('should return 401 when not authenticated', async () => {
        const postId = await insertTestPost({
          title: 'Test Post',
          slug: `test-post-delete-401-${Date.now()}`,
          createdById: creator.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        await request.delete(`/api/v1/posts/${postId}`).expect(401)
      })

      it('should return 403 when user is not creator or admin', async () => {
        const otherUser = await createTestUser()
        const postId = await insertTestPost({
          title: 'Test Post',
          slug: `test-post-delete-403-${Date.now()}`,
          createdById: creator.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        await request.authenticateAs(otherUser!)

        await request.delete(`/api/v1/posts/${postId}`).expect(403)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof createTestUserWithAge)
  void (0 as unknown as typeof CONTRIBUTING_USER_AGE_MS)
})
