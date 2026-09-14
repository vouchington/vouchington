import { describe, it, expect, beforeAll } from 'vitest'

import type { PrivateUser } from '@services/users/types'
import { caches } from '@services/entity-cache/caches'

import { createRequest } from '@voucha/test-helpers/api/server'
// Register this package routes on the shared app singleton for route tests.
import '../index.mts'
import {
  deletePostSlugForTest,
  insertTestPost,
  insertTestPostStory,
  insertTestRssFeedDirect,
  createTestRssFeedItemWithUrl,
  insertTestStory,
  setTestItemStoryId,
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

  describe('GET /md/posts/:idOrSlug', () => {
    it('should return 404 for non-existent post', async () => {
      const request = createRequest()
      await request.get('/md/posts/does-not-exist-post-xyz').expect(404)
    })

    it('should return text/markdown for a public post', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Detail MD Post ${random}`,
        slug: `detail-md-post-${random}`,
        createdById: user.id,
        markdown: 'This is the **body** of the post.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      const response = await request.get(`/md/posts/${postId}`).expect(200)
      expect(response.headers['content-type']).toContain('text/markdown')
      expect(response.text).toMatch(/^---/)
      expect(response.text).toContain('title')
      expect(response.text).toContain(`Detail MD Post ${random}`)
      expect(response.text).toContain('This is the **body** of the post.')
    })

    it('should return text/markdown for a public post by slug', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `detail-md-post-slug-${random}`
      const postId = await insertTestPost({
        title: `Detail MD Post Slug ${random}`,
        slug,
        createdById: user.id,
        markdown: 'This is the slug-addressed post body.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      const response = await request.get(`/md/posts/${slug}`).expect(200)
      expect(response.headers['content-type']).toContain('text/markdown')
      expect(response.text).toContain(`url: "https://voucha.ai/discussion/${slug}"`)
      expect(response.text).toContain('This is the slug-addressed post body.')
    })

    it('uses cached slug resolution before fetching the canonical post for markdown details', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `cached-resolution-md-post-${random}`
      const postId = await insertTestPost({
        title: `Cached Resolution MD Post ${random}`,
        slug,
        createdById: user.id,
        markdown: 'This post resolves through the cached canonical id.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      await caches.posts_lookup.set(slug, postId)
      await deletePostSlugForTest(postId, slug)

      const request = createRequest()
      const response = await request.get(`/md/posts/${slug}`).expect(200)
      expect(response.text).toContain(`Cached Resolution MD Post ${random}`)
      expect(response.text).toContain('This post resolves through the cached canonical id.')
    })

    it('uses canonical data point route slugs in detail frontmatter', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `data-point-md-post-${random}`
      const postId = await insertTestPost({
        title: `Data Point MD Post ${random}`,
        slug,
        createdById: user.id,
        markdown: 'Data point content.',
        postType: 'data_point',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      const response = await request.get(`/md/posts/${postId}`).expect(200)
      expect(response.text).toContain(`url: "https://voucha.ai/data-point/${slug}"`)
      expect(response.text).not.toContain(`https://voucha.ai/data_point/${slug}`)
    })

    it('enforces detail post type constraints', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Typed Constraint MD Post ${random}`,
        slug: `typed-constraint-md-post-${random}`,
        createdById: user.id,
        markdown: 'Typed constraint content.',
        postType: 'blog_post',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      await request.get(`/md/posts/${postId}?post_types=review`).expect(404)
      await request.get(`/md/posts/${postId}?post_types=blog_post`).expect(200)
    })

    it('uses AI summary markdown for story details', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const feed = await insertTestRssFeedDirect({})
      const item = await createTestRssFeedItemWithUrl(feed.id)
      const story = await insertTestStory({ title: `Story MD Post ${random}` })
      await setTestItemStoryId(item.id, story.id)
      const postId = await insertTestPost({
        title: `Story MD Post ${random}`,
        slug: `story-md-post-${random}`,
        createdById: user.id,
        markdown: '',
        postType: 'story',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await insertTestPostStory(postId, story.id, user.id)
      await setPostAiSummaryMarkdownForTest({
        postId,
        aiSummaryMarkdown: 'Generated **story** summary.',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      const response = await request.get(`/md/posts/${postId}`).expect(200)
      expect(response.text).toContain('Generated **story** summary.')
      expect(response.text).toContain(`url: "https://voucha.ai/story/story-md-post-${random}"`)
    })

    it('uses unweighted vote counts for markdown indexability', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Vote Count MD Post ${random}`,
        slug: `vote-count-md-post-${random}`,
        createdById: user.id,
        markdown: 'Vote count content.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1, scoreUp: 0 })
      const request = createRequest()
      const response = await request.get(`/md/posts/${postId}`).expect(200)
      expect(response.text).toContain(`Vote Count MD Post ${random}`)
    })

    it('should return 404 for non-public posts', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Private MD Post ${random}`,
        slug: `private-md-post-${random}`,
        createdById: user.id,
        markdown: 'Private content',
        broadcast: 'users',
        privacy: 'private',
      })
      const request = createRequest()
      await request.get(`/md/posts/${postId}`).expect(404)
    })

    it('should return 404 for public posts with restricted broadcast', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Restricted Broadcast MD Post ${random}`,
        slug: `restricted-broadcast-md-post-${random}`,
        createdById: user.id,
        markdown: 'Restricted broadcast content',
        broadcast: 'users',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      await request.get(`/md/posts/${postId}`).expect(404)
    })

    it('should set Cache-Control header with max-age=300', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Cache MD Post ${random}`,
        slug: `cache-md-post-${random}`,
        createdById: user.id,
        markdown: 'Content here',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      const response = await request.get(`/md/posts/${postId}`).expect(200)
      expect(response.headers['cache-control']).toBe('public, max-age=300')
    })

    it('returns ETag header for detail page', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `ETag MD Post ${random}`,
        slug: `etag-md-post-${random}`,
        createdById: user.id,
        markdown: 'ETag test content.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      const response = await request.get(`/md/posts/${postId}`).expect(200)
      expect(response.headers['etag']).toMatch(/^"[A-Za-z0-9_-]+"$/)
    })

    it('returns 304 for matching If-None-Match on detail page', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `304 MD Post ${random}`,
        slug: `304-md-post-${random}`,
        createdById: user.id,
        markdown: '304 test content.',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      const res1 = await request.get(`/md/posts/${postId}`).expect(200)
      const etag = res1.headers['etag']
      await request.get(`/md/posts/${postId}`).set('If-None-Match', etag).expect(304)
    })

    it('should return 404 for pending public posts', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const postId = await insertTestPost({
        title: `Pending MD Post ${random}`,
        slug: `pending-md-post-${random}`,
        createdById: user.id,
        markdown: 'Pending content',
        broadcast: 'everyone',
        privacy: 'public',
        clearanceStatus: 'pending',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      const request = createRequest()
      await request.get(`/md/posts/${postId}`).expect(404)
    })

    it('should return 404 for posts from suspended users', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const suspendedUser = await createTestUser({ username: `md-suspended-${random}` })
      const postId = await insertTestPost({
        title: `Suspended Author MD Post ${random}`,
        slug: `suspended-author-md-post-${random}`,
        createdById: suspendedUser.id,
        markdown: 'Suspended author content',
        broadcast: 'everyone',
        privacy: 'public',
      })
      await setMarkdownPostVotesForTest({ postId, countUp: 1 })
      await suspendTestUser(suspendedUser.id)
      const request = createRequest()
      await request.get(`/md/posts/${postId}`).expect(404)
    })
  })
})
