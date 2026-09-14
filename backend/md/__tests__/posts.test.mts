import { describe, it, expect, beforeAll } from 'vitest'

import type { PrivateUser } from '@services/users/types'

import { createRequest } from '@voucha/test-helpers/api/server'
// Register this package routes on the shared app singleton for route tests.
import '../index.mts'
import {
  insertTestPost,
  createTestUser,
  setMarkdownPostVotesForTest,
  setPostAiSummaryMarkdownForTest,
  suspendTestUser,
} from '@voucha/test-helpers'

describe('posts', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 8)
    const postId = await insertTestPost({
      title: `Seed MD Listing Post ${random}`,
      slug: `seed-md-listing-post-${random}`,
      createdById: user.id,
      markdown: 'Seed content for markdown listing tests.',
      broadcast: 'everyone',
      privacy: 'public',
    })
    await setMarkdownPostVotesForTest({ postId, countUp: 1 })
  })

  describe('GET /md/posts', () => {
    it('should return text/markdown content type', async () => {
      const request = createRequest()
      const response = await request.get('/md/posts').expect(200)
      expect(response.headers['content-type']).toContain('text/markdown')
    })

    it('should return markdown with frontmatter', async () => {
      const request = createRequest()
      const response = await request.get('/md/posts').expect(200)
      expect(response.text).toMatch(/^---/)
      expect(response.text).toContain('has_next_page')
    })

    it('should return markdown listing structure with posts', async () => {
      const request = createRequest()
      const response = await request.get(`/md/posts?creator=${user.id}`).expect(200)
      expect(response.text).toMatch(/^---/)
      expect(response.text).toContain('has_next_page')
      // response should have markdown headings for posts
      expect(response.text).toContain('## [')
    })

    it('uses canonical post route slugs in markdown listings', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `blog-md-listing-post-${random}`
      const postId = await insertTestPost({
        title: `Blog MD Listing Post ${random}`,
        slug,
        createdById: user.id,
        markdown: 'Blog listing content.',
        postType: 'blog_post',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      const response = await request
        .get(`/md/posts?post_types=blog_post&creator=${user.id}`)
        .expect(200)
      expect(response.text).toContain(`https://voucha.ai/blog-post/${slug}`)
      expect(response.text).not.toContain(`https://voucha.ai/blog_post/${slug}`)
    })

    it('should support pagination with limit', async () => {
      const request = createRequest()
      const response = await request.get('/md/posts?limit=2').expect(200)
      expect(response.text).toMatch(/^---/)
      expect(response.headers['content-type']).toContain('text/markdown')
    })

    it('should set Cache-Control header with max-age=60', async () => {
      const request = createRequest()
      const response = await request.get('/md/posts').expect(200)
      expect(response.headers['cache-control']).toBe('public, max-age=60')
    })

    it('returns ETag header', async () => {
      const request = createRequest()
      const response = await request.get('/md/posts').expect(200)
      expect(response.headers['etag']).toMatch(/^"[A-Za-z0-9_-]+"$/)
    })

    it('returns 304 for matching If-None-Match', async () => {
      const request = createRequest()
      const res1 = await request.get('/md/posts').expect(200)
      const etag = res1.headers['etag']
      await request.get('/md/posts').set('If-None-Match', etag).expect(304)
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof setPostAiSummaryMarkdownForTest)
  void (0 as unknown as typeof suspendTestUser)
})
