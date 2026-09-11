import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  deleteTestPost,
  followUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
} from '@voucha/test-helpers'
import { createCommunityPostFixture } from '@services/posts/test-support'
import type { PrivateUser } from '@services/users/types'

describe('post.ancestors', () => {
  let creator: PrivateUser
  let follower: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
    follower = await createTestUser()
    await followUser(follower, creator)
  })
  describe('GET /api/v1/posts/:idOrSlug/ancestors', () => {
    it('returns ancestors ordered from root to comment', async () => {
      const community = await insertTestCommunity({ createdById: creator.id })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: creator.id,
        role: 'owner',
      })
      const { id: postId } = await createCommunityPostFixture(creator, community.id, {
        title: 'Ancestor Root',
        markdown: 'Root content',
      })
      const parentCommentId = await insertTestPost({
        title: '',
        slug: `ancestor-parent-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Parent comment',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      const childCommentId = await insertTestPost({
        title: '',
        slug: `ancestor-child-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Child comment',
        postType: 'comment',
        rootId: postId,
        parentId: parentCommentId,
      })
      const request = createRequest()
      await request.authenticateAs(creator)
      const response = await request.get(`/api/v1/posts/${childCommentId}/ancestors`).expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.results[0]?.id).toBe(postId)
      expect(response.body.results.at(-1)?.id).toBe(childCommentId)
      expect(response.body.posts[childCommentId].can_delete).toBe(true)
    })

    it('includes community sidecar records for community post ancestors', async () => {
      const community = await insertTestCommunity({ createdById: creator.id })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: creator.id,
        role: 'owner',
      })
      const { id: postId } = await createCommunityPostFixture(creator, community.id, {
        title: 'Ancestor Community Root',
        markdown: 'Root content',
      })
      const commentId = await insertTestPost({
        title: '',
        slug: `ancestor-community-child-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Child comment',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      const request = createRequest()
      await request.authenticateAs(creator)
      const response = await request.get(`/api/v1/posts/${commentId}/ancestors`).expect(200)

      expect(response.body.communities).toEqual({
        [community.id]: { id: community.id, name: community.name, slug: community.slug },
      })
    })

    it('returns all ancestors for anonymous users', async () => {
      const postId = await insertTestPost({
        title: 'Ancestor Root',
        slug: `post-ancestor-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
      })
      const parentCommentId = await insertTestPost({
        title: '',
        slug: `ancestor-parent-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Parent comment',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      const childCommentId = await insertTestPost({
        title: '',
        slug: `ancestor-child-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Child comment',
        postType: 'comment',
        rootId: postId,
        parentId: parentCommentId,
      })
      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${childCommentId}/ancestors`).expect(200)

      expect(
        response.body.results.some((ancestor: { id: string }) => ancestor.id === parentCommentId),
      ).toBe(true)
      expect(response.body.results.at(-1)?.id).toBe(childCommentId)
    })

    it('preserves a deleted ancestor as a structural tombstone', async () => {
      const rootId = await insertTestPost({
        title: 'Ancestor Root Published',
        slug: `ancestor-root-published-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
      })
      const parentId = await insertTestPost({
        title: '',
        slug: `ancestor-parent-deleted-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Parent to delete',
        postType: 'comment',
        rootId: rootId,
        parentId: rootId,
      })
      await deleteTestPost(parentId)

      const childId = await insertTestPost({
        title: '',
        slug: `ancestor-child-published-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Child comment',
        postType: 'comment',
        rootId: rootId,
        parentId: parentId,
      })
      const response = await createRequest().get(`/api/v1/posts/${childId}/ancestors`).expect(200)

      expect(response.body.results.map((result: { id: string }) => result.id)).toEqual([
        rootId,
        parentId,
        childId,
      ])
      expect(response.body.posts[parentId]).toBeUndefined()
    })

    it('hides ancestors for a deleted comment leaf', async () => {
      const rootId = await insertTestPost({
        title: 'Ancestor Root Published',
        slug: `ancestor-root-published-deleted-leaf-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
      })
      const commentId = await insertTestPost({
        title: '',
        slug: `ancestor-leaf-to-delete-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Leaf comment',
        postType: 'comment',
        rootId: rootId,
        parentId: rootId,
      })
      await deleteTestPost(commentId)

      const request = createRequest()
      await request.get(`/api/v1/posts/${commentId}/ancestors`).expect(404)
    })

    it('returns ancestors for logged-out users on followers-public roots', async () => {
      const rootId = await insertTestPost({
        title: 'Follower Public Ancestor Root',
        slug: `follower-public-ancestor-root-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
        broadcast: 'followers',
      })
      const commentId = await insertTestPost({
        title: '',
        slug: `follower-public-ancestor-comment-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Leaf comment',
        postType: 'comment',
        rootId,
        parentId: rootId,
      })
      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${commentId}/ancestors`).expect(200)

      expect(response.body.results[0]?.id).toBe(rootId)
      expect(response.body.results.at(-1)?.id).toBe(commentId)
    })

    it('sets an explicit private, no-store Cache-Control header, since the edge tag scheme cannot purge a response covering multiple ancestor entities', async () => {
      const rootId = await insertTestPost({
        title: 'Ancestor Root No Cache',
        slug: `ancestor-root-no-cache-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
      })
      const commentId = await insertTestPost({
        title: '',
        slug: `ancestor-no-cache-comment-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Leaf comment',
        postType: 'comment',
        rootId,
        parentId: rootId,
      })
      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${commentId}/ancestors`).expect(200)

      expect(response.headers['cache-control']).toBe('private, no-store')
    })

    it('returns 404 for logged-out users and returns ancestors to followers on followers-private roots', async () => {
      const rootId = await insertTestPost({
        title: 'Follower Ancestor Root',
        slug: `follower-ancestor-root-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
        broadcast: 'followers',
        privacy: 'private',
      })
      const commentId = await insertTestPost({
        title: '',
        slug: `follower-ancestor-comment-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Leaf comment',
        postType: 'comment',
        rootId,
        parentId: rootId,
      })
      const loggedOutRequest = createRequest()
      await loggedOutRequest.get(`/api/v1/posts/${commentId}/ancestors`).expect(404)

      const followerRequest = createRequest()
      await followerRequest.authenticateAs(follower)
      const response = await followerRequest.get(`/api/v1/posts/${commentId}/ancestors`).expect(200)

      expect(response.body.results[0]?.id).toBe(rootId)
      expect(response.body.results.at(-1)?.id).toBe(commentId)
    })
  })
})
