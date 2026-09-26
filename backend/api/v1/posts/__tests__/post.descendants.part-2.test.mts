import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  deleteTestPost,
  followUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
} from '@voucha/test-helpers'

import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

import type { PrivateUser } from '@services/users/types'

import { createCommunityPostFixture } from '@services/posts/test-support'

describe('post.descendants', () => {
  let creator: PrivateUser

  let follower: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
    follower = await createTestUser()
    await followUser(follower, creator)
  })

  describe('GET /api/v1/posts/:idOrSlug/descendants', () => {
    it('returns descendants for logged-out users on followers-public roots', async () => {
      const rootPostId = await insertTestPost({
        title: 'Followers Public Root',
        slug: `followers-public-root-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root',
        broadcast: 'followers',
      })
      const childId = await insertTestPost({
        title: '',
        slug: `followers-public-child-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Child',
        postType: 'comment',
        rootId: rootPostId,
        parentId: rootPostId,
      })
      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${rootPostId}/descendants`).expect(200)

      const resultIds = response.body.results.map((r: { id: string }) => r.id)
      expect(resultIds).toContain(childId)
    })

    it('paginates visible descendants when an invisible raw page comes first', async () => {
      const rootPostId = await insertTestPost({
        title: 'Public root with a pending comment',
        slug: `descendants-visibility-root-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root',
      })
      await insertTestPost({
        title: '',
        slug: `descendants-visibility-pending-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Pending comment',
        postType: 'comment',
        rootId: rootPostId,
        parentId: rootPostId,
        clearanceStatus: 'pending',
      })
      await insertTestPost({
        title: '',
        slug: `descendants-visibility-pending-second-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Second pending comment',
        postType: 'comment',
        rootId: rootPostId,
        parentId: rootPostId,
        clearanceStatus: 'pending',
      })
      const visibleCommentId = await insertTestPost({
        title: '',
        slug: `descendants-visibility-approved-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Approved comment',
        postType: 'comment',
        rootId: rootPostId,
        parentId: rootPostId,
        clearanceStatus: 'approved',
      })

      const response = await createRequest()
        .get(`/api/v1/posts/${rootPostId}/descendants?limit=2`)
        .expect(200)

      expect(response.body.results.map((result: { id: string }) => result.id)).toEqual([
        visibleCommentId,
      ])
      expect(response.body.page_info).toEqual({
        has_next_page: false,
        start_cursor: expect.any(String),
        end_cursor: null,
      })
    })

    it('returns edit and delete capabilities per comment for authenticated users', async () => {
      const community = await insertTestCommunity({ createdById: creator.id })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: creator.id,
        role: 'owner',
      })
      const { id: postId } = await createCommunityPostFixture(creator, community.id, {
        title: 'Post for Auth Fields Test',
        markdown: 'Root content',
      })
      const commentId = await insertTestPost({
        title: '',
        slug: `comment-auth-fields-${Date.now()}`,
        createdById: creator.id,
        markdown: 'A comment',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })

      const request = createRequest()
      await request.authenticateAs(creator)
      const response = await request.get(`/api/v1/posts/${postId}/descendants`).expect(200)

      // bookmarks key is absent when user has no bookmarks (streamJsonObject omits undefined values)

      // can_edit_content and can_delete are set per post in the posts map
      const comment = response.body.posts[commentId]
      expect(comment).toBeDefined()
      expect(Object.hasOwn(comment, 'can_edit_content')).toBe(true)
      expect(Object.hasOwn(comment, 'can_delete')).toBe(true)
      expect(typeof comment.can_edit_content).toBe('boolean')
      expect(typeof comment.can_delete).toBe('boolean')

      const followerRequest = createRequest()
      await followerRequest.authenticateAs(follower)
      const followerResponse = await followerRequest
        .get(`/api/v1/posts/${postId}/descendants`)
        .expect(200)

      const followerComment = followerResponse.body.posts[commentId]
      expect(followerComment).toBeDefined()
      expect(Object.hasOwn(followerComment, 'can_edit_content')).toBe(false)
      expect(Object.hasOwn(followerComment, 'can_delete')).toBe(true)
    })

    it('returns 404 for logged-out users and returns descendants to followers on followers-private roots', async () => {
      const rootPostId = await insertTestPost({
        title: 'Followers Only Root',
        slug: `followers-only-root-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root',
        broadcast: 'followers',
        privacy: 'private',
      })
      const childId = await insertTestPost({
        title: '',
        slug: `followers-only-child-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Child',
        postType: 'comment',
        rootId: rootPostId,
        parentId: rootPostId,
      })
      const loggedOutRequest = createRequest()
      await loggedOutRequest.get(`/api/v1/posts/${rootPostId}/descendants`).expect(404)

      const followerRequest = createRequest()
      await followerRequest.authenticateAs(follower)
      const response = await followerRequest
        .get(`/api/v1/posts/${rootPostId}/descendants`)
        .expect(200)

      const resultIds = response.body.results.map((r: { id: string }) => r.id)
      expect(resultIds).toContain(childId)
    })

    it('masks a private root before malformed pagination details', async () => {
      const rootPostId = await insertTestPost({
        title: 'Private descendant query root',
        slug: `private-descendant-query-root-${crypto.randomUUID()}`,
        createdById: creator.id,
        markdown: 'Root',
        privacy: 'private',
        broadcast: 'followers',
      })

      await createRequest().get(`/api/v1/posts/${rootPostId}/descendants?limit=zero`).expect(404)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof deleteTestPost)
  void (0 as unknown as typeof HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
})
