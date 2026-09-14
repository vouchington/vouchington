import { randomUUID } from 'node:crypto'

import { describe, it, expect, beforeAll } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
  createTestUser,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'

import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'

import type { PrivateUser } from '@services/users/types'

import { createTopicAliases } from '@services/topics/aliases'

const uniqueSlug = (prefix: string) => `${prefix}-${randomUUID()}`

describe('posts', () => {
  describe('Posts Collection Routes', () => {
    let user: PrivateUser

    let admin: PrivateUser

    let viewer: PrivateUser
    void (0 as unknown as typeof admin)

    beforeAll(async () => {
      user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      admin = await createTestUser({ administrator: true })
      viewer = await createTestUser()
    })

    describe('GET /api/v1/posts', () => {
      it('keeps an authored root and comment when both are collection results', async () => {
        const commentAuthor = await createTestUser()
        const rootPostId = await insertTestPost({
          title: 'Root for authored comment',
          slug: uniqueSlug('authored-comment-root'),
          createdById: commentAuthor.id,
          markdown: 'Root content',
          postType: 'review',
        })
        const commentId = await insertTestPost({
          title: 'Authored comment',
          slug: uniqueSlug('authored-comment'),
          createdById: commentAuthor.id,
          markdown: 'Comment content',
          postType: 'comment',
          rootId: rootPostId,
          parentId: rootPostId,
        })

        const response = await createRequest()
          .get(`/api/v1/posts?creator=${commentAuthor.id}&post_types=review,comment`)
          .expect(200)

        expect(new Set(response.body.results.map((result: { id: string }) => result.id))).toEqual(
          new Set([rootPostId, commentId]),
        )
        expect(response.body.posts[commentId].root_id).toBe(rootPostId)
        expect(response.body.posts[rootPostId]).toMatchObject({
          id: rootPostId,
          post_type: 'review',
        })
      })

      it('hydrates a comment root that is not a collection result', async () => {
        const commentAuthor = await createTestUser()
        const rootPostId = await insertTestPost({
          title: 'Root outside comment results',
          slug: uniqueSlug('comment-only-root'),
          createdById: commentAuthor.id,
          markdown: 'Root content',
          postType: 'review',
        })
        const commentId = await insertTestPost({
          title: 'Comment-only result',
          slug: uniqueSlug('comment-only-result'),
          createdById: commentAuthor.id,
          markdown: 'Comment content',
          postType: 'comment',
          rootId: rootPostId,
          parentId: rootPostId,
        })

        const response = await createRequest()
          .get(`/api/v1/posts?creator=${commentAuthor.id}&post_types=comment`)
          .expect(200)

        expect(response.body.results).toEqual([
          expect.objectContaining({ id: commentId, post_type: 'comment' }),
        ])
        expect(response.body.posts[commentId].root_id).toBe(rootPostId)
        expect(response.body.posts[rootPostId]).toMatchObject({
          id: rootPostId,
          post_type: 'review',
        })
      })

      it('should include bookmarks and election_votes for authenticated users', async () => {
        await insertTestPost({
          title: 'Test Post with Auth',
          slug: uniqueSlug('test-post-auth'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        await request.authenticateAs(user!)
        const response = await request.get('/api/v1/posts').expect(200)

        // Authenticated users should get bookmarks and election_votes
        expect(response.body).toHaveProperty('posts')
        expect(response.body).toHaveProperty('posts_metrics')
        expect(response.body).toHaveProperty('results')
        expect(response.body).toHaveProperty('page_info')

        // bookmarks and election_votes are present for authenticated users
        expect(typeof response.body.bookmarks).toBe('object')
        expect(typeof response.body.election_votes).toBe('object')
      })

      it('should omit authenticated sidecars for unauthenticated users', async () => {
        const response = await createRequest().get('/api/v1/posts').expect(200)

        expect(response.body).not.toHaveProperty('bookmarks')
        expect(response.body).not.toHaveProperty('election_votes')
      })

      it('should not cache responses for authenticated users', async () => {
        await insertTestPost({
          title: 'Test Post No Cache',
          slug: uniqueSlug('test-post-no-cache'),
          createdById: user!.id,
          markdown: 'Test content',
        })
        const request = createRequest()
        await request.authenticateAs(user!)
        const response = await request.get('/api/v1/posts').expect(200)

        // Should not have public cache-control header for authenticated users
        expect(
          !response.headers['cache-control'] ||
            !response.headers['cache-control'].includes('public'),
        ).toBe(true)
      })

      it('should return consistent structure across multiple pages', async () => {
        // Create multiple posts for pagination
        for (let i = 0; i < 5; i++) {
          await insertTestPost({
            title: `Pagination Consistency Post ${i}`,
            slug: uniqueSlug(`pagination-consistency-${i}`),
            createdById: user!.id,
            markdown: `Content ${i}`,
          })
        }

        const request = createRequest()

        // Get first page
        const firstPage = await request.get('/api/v1/posts?limit=2').expect(200)
        expect(typeof firstPage.body.posts).toBe('object')
        expect(typeof firstPage.body.posts_metrics).toBe('object')
        expect(Array.isArray(firstPage.body.results)).toBe(true)

        // Get second page
        expect(firstPage.body.page_info.has_next_page).toBe(true)
        expect(firstPage.body.page_info.end_cursor).toBeTruthy()
        const secondPage = await request
          .get(`/api/v1/posts?limit=2&after=${firstPage.body.page_info.end_cursor}`)
          .expect(200)

        // Structure should be consistent
        expect(typeof secondPage.body.posts).toBe('object')
        expect(typeof secondPage.body.posts_metrics).toBe('object')
        expect(Array.isArray(secondPage.body.results)).toBe(true)

        // Pages should not overlap
        const firstPageIds = firstPage.body.results.map((r: { id: string }) => r.id)
        const secondPageIds = new Set(secondPage.body.results.map((r: { id: string }) => r.id))
        const overlap = firstPageIds.filter((id: string) => secondPageIds.has(id))
        expect(overlap.length).toBe(0)
      })

      it('should mask anonymous authors in collection responses for other users', async () => {
        const postId = await insertTestPost({
          title: 'Anonymous Feed Post',
          slug: uniqueSlug('anonymous-feed-post'),
          createdById: user.id,
          markdown: 'masked in list',
          isAnonymous: true,
        })
        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get('/api/v1/posts?limit=100&sort=new').expect(200)
        const resultIds = response.body.results.map((result: { id: string }) => result.id)

        expect(resultIds).toContain(postId)
        expect(response.body.posts[postId].created_by_id).toBeNull()
        expect(response.body.posts[postId].created_by).toBeNull()
      })
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestPostReview)
  void (0 as unknown as typeof insertTestTopic)
  void (0 as unknown as typeof HTTP_CACHE_SHORT_MAX_AGE_SECONDS)
  void (0 as unknown as typeof createTopicAliases)
})
