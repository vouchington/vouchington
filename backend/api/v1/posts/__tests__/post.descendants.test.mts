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
    it('returns a comment tree and scrubs deleted comments', async () => {
      const postId = await insertTestPost({
        title: 'Post With Comments',
        slug: `post-comments-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
      })
      const parentCommentId = await insertTestPost({
        title: '',
        slug: `comment-parent-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Parent comment',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      const childCommentId = await insertTestPost({
        title: '',
        slug: `comment-child-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Child comment',
        postType: 'comment',
        rootId: postId,
        parentId: parentCommentId,
      })
      const deletedCommentId = await insertTestPost({
        title: '',
        slug: `comment-deleted-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Deleted comment',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      await deleteTestPost(deletedCommentId)

      const anotherDeletedCommentId = await insertTestPost({
        title: '',
        slug: `comment-deleted-another-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Another deleted comment',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      await deleteTestPost(anotherDeletedCommentId)

      const request = createRequest()
      const response = await request
        .get(`/api/v1/posts/${postId}/descendants?max_depth=2`)
        .expect(200)

      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`,
      )

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.page_info).toBeDefined()
      expect(response.body.posts).toBeDefined()
      expect(response.body.posts_metrics).toBeDefined()

      const resultIds = response.body.results.map((r: { id: string }) => r.id)

      // All comments should be included (deleted comments are preserved)
      expect(resultIds).toContain(deletedCommentId)
      expect(resultIds).toContain(anotherDeletedCommentId)
      expect(resultIds).toContain(parentCommentId)
      expect(resultIds).toContain(childCommentId)

      // Posts should be populated for all results
      expect(Object.keys(response.body.posts).length).toBeGreaterThan(0)
      expect(response.body.posts[parentCommentId]).toBeDefined()
      expect(response.body.posts[childCommentId]).toBeDefined()
    })

    it('keeps deleted non-leaf comments to preserve tree structure', async () => {
      const postId = await insertTestPost({
        title: 'Post With Deleted Non-Leaf',
        slug: `post-comments-deleted-non-leaf-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
      })
      const deletedParentId = await insertTestPost({
        title: '',
        slug: `comment-deleted-parent-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Deleted parent',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      await deleteTestPost(deletedParentId)

      const childId = await insertTestPost({
        title: '',
        slug: `comment-child-after-deleted-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Child comment',
        postType: 'comment',
        rootId: postId,
        parentId: deletedParentId,
      })
      const request = createRequest()
      const response = await request
        .get(`/api/v1/posts/${postId}/descendants?max_depth=3`)
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      const resultIds = response.body.results.map((r: { id: string }) => r.id)

      // Deleted parent and child should both be included
      expect(resultIds).toContain(deletedParentId)
      expect(resultIds).toContain(childId)
    })

    it('returns descendants when called on a mid-level comment', async () => {
      const postId = await insertTestPost({
        title: 'Root Post',
        slug: `post-mid-level-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
      })
      const level1CommentId = await insertTestPost({
        title: '',
        slug: `comment-level1-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Level 1 comment',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      const level2CommentId = await insertTestPost({
        title: '',
        slug: `comment-level2-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Level 2 comment',
        postType: 'comment',
        rootId: postId,
        parentId: level1CommentId,
      })
      const level3CommentId = await insertTestPost({
        title: '',
        slug: `comment-level3-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Level 3 comment',
        postType: 'comment',
        rootId: postId,
        parentId: level2CommentId,
      })
      // Query descendants starting from the level 1 comment (not the root post)
      const request = createRequest()
      const response = await request
        .get(`/api/v1/posts/${level1CommentId}/descendants?max_depth=3`)
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      const resultIds = response.body.results.map((r: { id: string }) => r.id)

      // Should include level 2 and level 3 comments
      expect(resultIds).toContain(level2CommentId)
      expect(resultIds).toContain(level3CommentId)

      // Should NOT include the level 1 comment itself or the root post
      expect(resultIds).not.toContain(level1CommentId)
      expect(resultIds).not.toContain(postId)
    })

    it('paginates descendants without gaps or duplicates', async () => {
      const postId = await insertTestPost({
        title: 'Root Post With Cursor Pagination',
        slug: `post-cursor-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
      })
      await insertTestPost({
        title: '',
        slug: `comment-cursor-a-${Date.now()}`,
        createdById: creator.id,
        markdown: 'First',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      await insertTestPost({
        title: '',
        slug: `comment-cursor-b-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Second',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })
      const request = createRequest()
      const first = await request.get(`/api/v1/posts/${postId}/descendants?limit=1`).expect(200)
      expect(first.body.page_info.has_next_page).toBe(true)
      expect(first.body.page_info.end_cursor).toEqual(expect.any(String))

      const second = await request
        .get(
          `/api/v1/posts/${postId}/descendants?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor as string)}`,
        )
        .expect(200)
      expect(second.body.results).toHaveLength(1)
      expect(second.body.results[0].id).not.toBe(first.body.results[0].id)
    })

    it('returns all descendants', async () => {
      const rootPostId = await insertTestPost({
        title: 'Root',
        slug: `root-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root',
      })
      const childId = await insertTestPost({
        title: '',
        slug: `child-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Child',
        postType: 'comment',
        rootId: rootPostId,
        parentId: rootPostId,
      })
      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${rootPostId}/descendants`).expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      const resultIds = response.body.results.map((r: { id: string }) => r.id)

      expect(resultIds).toContain(childId)
    })

    it('returns post_elections keyed by comment id in the descendants response', async () => {
      const postId = await insertTestPost({
        title: 'Post for Elections Test',
        slug: `post-elections-desc-${Date.now()}`,
        createdById: creator.id,
        markdown: 'Root content',
      })
      const commentId = await insertTestPost({
        title: '',
        slug: `comment-elections-${Date.now()}`,
        createdById: creator.id,
        markdown: 'A comment',
        postType: 'comment',
        rootId: postId,
        parentId: postId,
      })

      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${postId}/descendants`).expect(200)

      expect(response.body.post_elections).toBeDefined()
      expect(typeof response.body.post_elections).toBe('object')
      expect(Array.isArray(response.body.post_elections)).toBe(false)
      expect(response.body.post_elections[commentId]).toBeDefined()
      expect(response.body.post_elections[commentId]).toHaveProperty('votes_count_up')
      expect(response.body.post_elections[commentId]).toHaveProperty('votes_count_down')
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestCommunity)
  void (0 as unknown as typeof insertTestCommunityMember)
  void (0 as unknown as typeof createCommunityPostFixture)
})
