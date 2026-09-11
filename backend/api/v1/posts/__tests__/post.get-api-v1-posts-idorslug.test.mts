import { describe, it, expect, beforeAll } from 'vitest'

import type { PrivateUser } from '@services/users/types'

import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestPost,
  insertTestPost,
  createTestUser,
  createTestUserWithAge,
  followUser,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'

import {
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers/entities/communities'
import { createCommunityPostFixture } from '@services/posts/test-support'

import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

import { getMinUUIDv7ForDate } from '@modules/utils/ids'

describe('post', () => {
  describe('Post Individual Routes', () => {
    let creator: PrivateUser

    let viewer: PrivateUser

    beforeAll(async () => {
      creator = await createTestUser()
      viewer = await createTestUser()
      await followUser(viewer, creator)
    })

    describe('GET /api/v1/posts/:idOrSlug', () => {
      it('should return a post by ID', async () => {
        const postId = await insertTestPost({
          title: 'Test Post',
          slug: `test-post-get-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.id).toBe(postId)
        expect(response.body.post.title).toBe('Test Post')
        expect(response.body).toHaveProperty('post_metrics')
        expect(response.body).toHaveProperty('post_election')
        expect(response.body).toHaveProperty('html')
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
        )
        expect(response.headers['vary']).toContain('Cookie')
        expect(response.headers['vary']).toContain('Authorization')
      })

      it('should return a post by slug', async () => {
        const slug = `test-post-slug-${Math.random().toString(36).slice(2, 8)}`
        const postId = await insertTestPost({
          title: 'Test Post Slug',
          slug,
          createdById: creator.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/posts/${slug}`).expect(200)

        expect(response.body.post.id).toBe(postId)
        expect(response.body.post.title).toBe('Test Post Slug')
      })

      it('should return 404 for non-existent post', async () => {
        const request = createRequest()
        await request.get('/api/v1/posts/00000000-0000-0000-0000-000000000000').expect(404)
      })

      it('should mask anonymous authors for non-creators', async () => {
        const postId = await insertTestPost({
          title: 'Anonymous Post',
          slug: `anonymous-post-${Date.now()}`,
          createdById: creator.id,
          markdown: 'hidden author',
          isAnonymous: true,
        })
        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.created_by_id).toBeNull()
        expect(response.body.post.created_by).toBeNull()
      })

      it('should mask anonymous updater identity for non-creators', async () => {
        const postId = await insertTestPost({
          title: 'Anonymous Updated Post',
          slug: `anonymous-updated-post-${Date.now()}`,
          createdById: creator.id,
          markdown: 'hidden author',
          isAnonymous: true,
        })
        const creatorRequest = createRequest()
        await creatorRequest.authenticateAs(creator)
        // Use a non-content field change to set updated_by_id without
        // resetting clearance_status to 'pending' (title/markdown changes
        // trigger clearance reset, making the post invisible to non-creators).
        const patchResponse = await creatorRequest
          .patch(`/api/v1/posts/${postId}`)
          .send({ broadcast: 'everyone' })
          .expect(200)

        // Verify updated_by_id was actually set before testing masking
        expect(patchResponse.body.post.updated_by_id).toBe(creator.id)

        const viewerRequest = createRequest()
        await viewerRequest.authenticateAs(viewer)
        const response = await viewerRequest.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.created_by_id).toBeNull()
        expect(response.body.post.created_by).toBeNull()
        expect(response.body.post.updated_by_id).toBeNull()
        expect(response.body.post.updated_by).toBeNull()
      })

      it('should keep anonymous authors visible for creators', async () => {
        const postId = await insertTestPost({
          title: 'Anonymous Creator View',
          slug: `anonymous-creator-view-${Date.now()}`,
          createdById: creator.id,
          markdown: 'hidden author',
          isAnonymous: true,
        })
        const request = createRequest()
        await request.authenticateAs(creator)
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.created_by_id).toBe(creator.id)
        expect(response.body.post.created_by).toBeTruthy()
      })

      it('should return users-public posts to logged-out users', async () => {
        const postId = await insertTestPost({
          title: 'Users Only',
          slug: `users-only-${Date.now()}`,
          createdById: creator.id,
          markdown: 'restricted',
          broadcast: 'users',
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.id).toBe(postId)
      })

      it('should return users-private posts to authenticated users and hide them from logged-out users', async () => {
        const postId = await insertTestPost({
          title: 'Users Only Authenticated',
          slug: `users-only-auth-${Date.now()}`,
          createdById: creator.id,
          markdown: 'restricted',
          broadcast: 'users',
          privacy: 'private',
        })
        const loggedOutRequest = createRequest()
        await loggedOutRequest.get(`/api/v1/posts/${postId}`).expect(404)

        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.id).toBe(postId)
      })

      it('should return followers-public posts to logged-out users', async () => {
        const postId = await insertTestPost({
          title: 'Followers Only Logged Out',
          slug: `followers-only-logged-out-${Date.now()}`,
          createdById: creator.id,
          markdown: 'restricted',
          broadcast: 'followers',
        })
        const request = createRequest()
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.id).toBe(postId)
      })

      it('should return followers-private posts to followers and hide them from logged-out users', async () => {
        const postId = await insertTestPost({
          title: 'Followers Only Authenticated',
          slug: `followers-only-auth-${Date.now()}`,
          createdById: creator.id,
          markdown: 'restricted',
          broadcast: 'followers',
          privacy: 'private',
        })
        const loggedOutRequest = createRequest()
        await loggedOutRequest.get(`/api/v1/posts/${postId}`).expect(404)

        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.id).toBe(postId)
      })

      it('should include can_edit_content: true for creator on a new post', async () => {
        const postId = await insertTestPost({
          title: 'New Post',
          slug: `new-post-can-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Fresh content',
        })
        const request = createRequest()
        await request.authenticateAs(creator)
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.can_edit_content).toBe(true)
      })

      it('should include can_edit_content: false for creator on an old post', async () => {
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
        const oldId = getMinUUIDv7ForDate(twoDaysAgo)
        const postId = await insertTestPost({
          id: oldId,
          title: 'Old Post',
          slug: `old-post-can-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Old content',
        })
        const request = createRequest()
        await request.authenticateAs(creator)
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.can_edit_content).toBe(false)
      })

      it('should not include can_edit_content for non-owner viewers', async () => {
        const postId = await insertTestPost({
          title: 'Viewer Post',
          slug: `viewer-post-can-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'Some content',
        })
        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.can_edit_content).toBeUndefined()
      })

      it('includes can_delete: true for post author', async () => {
        const postId = await insertTestPost({
          title: 'Author Delete Post',
          slug: `author-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'content',
        })
        const request = createRequest()
        await request.authenticateAs(creator)
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.can_delete).toBe(true)
      })

      it('includes community sidecar records for community posts', async () => {
        const postOwner = await createTestUser()
        const community = await insertTestCommunity({ createdById: postOwner.id })
        await insertTestCommunityMember({ communityId: community.id, userId: postOwner.id })
        const communityPost = await createCommunityPostFixture(postOwner, community.id)

        const request = createRequest()
        const response = await request.get(`/api/v1/posts/${communityPost.id}`).expect(200)

        expect(response.body.post.community_id).toBe(community.id)
        expect(response.body.communities).toEqual({
          [community.id]: { id: community.id, name: community.name, slug: community.slug },
        })
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof createTestPost)
  void (0 as unknown as typeof createTestUserWithAge)
  void (0 as unknown as typeof CONTRIBUTING_USER_AGE_MS)
  // keep generated shard import bindings live for typecheck
  void (0 as unknown as typeof insertTestCommunity)
  void (0 as unknown as typeof insertTestCommunityMember)
  void (0 as unknown as typeof createCommunityPostFixture)
})
