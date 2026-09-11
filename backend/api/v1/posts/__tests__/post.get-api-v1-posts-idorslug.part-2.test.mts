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
      it('does not include can_delete for non-owner viewer of a global post', async () => {
        const postId = await insertTestPost({
          title: 'Viewer No Delete Post',
          slug: `viewer-no-delete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdById: creator.id,
          markdown: 'content',
        })
        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get(`/api/v1/posts/${postId}`).expect(200)

        expect(response.body.post.can_delete).toBeUndefined()
      })

      it('includes can_delete: true for community moderator viewing a community comment', async () => {
        const mod = await createTestUser()
        const postOwner = await createTestUser()
        const community = await insertTestCommunity({ createdById: mod.id })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: mod.id,
          role: 'moderator',
        })
        await insertTestCommunityMember({ communityId: community.id, userId: postOwner.id })
        const communityPost = await createCommunityPostFixture(postOwner, community.id)
        const comment = await createCommunityPostFixture(postOwner, community.id, {
          post_type: 'comment',
          parent_id: communityPost.id,
        })

        const request = createRequest()
        await request.authenticateAs(mod)
        const response = await request.get(`/api/v1/posts/${comment.id}`).expect(200)

        expect(response.body.post.can_delete).toBe(true)
      })

      it('includes can_unpublish_from_community: true for community moderator on an approved community post', async () => {
        const mod = await createTestUser()
        const postOwner = await createTestUser()
        const community = await insertTestCommunity({ createdById: mod.id })
        await insertTestCommunityMember({
          communityId: community.id,
          userId: mod.id,
          role: 'moderator',
        })
        await insertTestCommunityMember({ communityId: community.id, userId: postOwner.id })
        const communityPost = await createCommunityPostFixture(postOwner, community.id)

        const request = createRequest()
        await request.authenticateAs(mod)
        const response = await request.get(`/api/v1/posts/${communityPost.id}`).expect(200)

        expect(response.body.post.can_unpublish_from_community).toBe(true)
      })

      it('does not include can_unpublish_from_community for non-moderator member', async () => {
        const owner = await createTestUser()
        const member = await createTestUser()
        const community = await insertTestCommunity({ createdById: owner.id })
        await insertTestCommunityMember({ communityId: community.id, userId: owner.id })
        await insertTestCommunityMember({ communityId: community.id, userId: member.id })
        const communityPost = await createCommunityPostFixture(owner, community.id)

        const request = createRequest()
        await request.authenticateAs(member)
        const response = await request.get(`/api/v1/posts/${communityPost.id}`).expect(200)

        expect(response.body.post.can_unpublish_from_community).toBeUndefined()
      })
    })

    describe('GET /api/v1/posts/:idOrSlug/follow-context', () => {
      it('returns only followed-user post votes', async () => {
        const isolatedViewer = await createTestUser()
        const likedFollower = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        const unfollowedDisliker = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
        await followUser(isolatedViewer, likedFollower)

        const post = await createTestPost({
          user: creator,
          title: `Follow Context Post ${Date.now()}`,
        })

        const likedRequest = createRequest()
        await likedRequest.authenticateAs(likedFollower)
        await likedRequest.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)

        const dislikedRequest = createRequest()
        await dislikedRequest.authenticateAs(unfollowedDisliker)
        await dislikedRequest
          .put(`/api/v1/posts/${post.id}/vote`)
          .send({ choice: 'dislike' })
          .expect(204)

        const request = createRequest()
        await request.authenticateAs(isolatedViewer)
        const response = await request.get(`/api/v1/posts/${post.id}/follow-context`).expect(200)

        expect(response.body.positive_by_following.total).toBe(1)
        expect(response.body.positive_by_following.users).toHaveLength(1)
        expect(response.body.positive_by_following.users[0].id).toBe(likedFollower.id)
        expect(response.body.negative_by_following.total).toBe(0)
        expect(response.body.negative_by_following.users).toHaveLength(0)
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof HTTP_CACHE_LONG_MAX_AGE_SECONDS)
  void (0 as unknown as typeof getMinUUIDv7ForDate)
})
