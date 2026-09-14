import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestRssFeedItemWithUrl,
  createTestUser,
  insertTestPost,
  insertTestPostStory,
  insertTestRssFeedDirect,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('posts.search-filters', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('GET /api/v1/posts - search and post type filters', () => {
    it('should filter by article post type', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const articleId = await insertTestPost({
        title: `Article ${random}`,
        slug: `article-${random}`,
        createdById: user.id,
        markdown: 'Article content',
        postType: 'article',
      })
      await insertTestPost({
        title: `Discussion ${random}`,
        slug: `discussion-${random}`,
        createdById: user.id,
        markdown: 'Discussion content',
        postType: 'discussion',
      })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/posts?post_types=article&creator=${user.id}`)
        .expect(200)

      const postTypes = response.body.results.map(
        (r: { id: string }) => response.body.posts[r.id]?.post_type,
      )
      expect(postTypes.every((t: string) => t === 'article')).toBe(true)
      expect(response.body.results.map((r: { id: string }) => r.id)).toContain(articleId)
    })

    it('should filter by blog_post post type', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const blogPostId = await insertTestPost({
        title: `Blog ${random}`,
        slug: `blog-${random}`,
        createdById: user.id,
        markdown: 'Blog content',
        postType: 'blog_post',
      })

      const request = createRequest()
      const response = await request
        .get(`/api/v1/posts?post_types=blog_post&creator=${user.id}`)
        .expect(200)

      const postTypes = response.body.results.map(
        (r: { id: string }) => response.body.posts[r.id]?.post_type,
      )
      expect(postTypes.every((t: string) => t === 'blog_post')).toBe(true)
      expect(response.body.results.map((r: { id: string }) => r.id)).toContain(blogPostId)
    })

    it('should filter by story post type', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const storyId = await insertTestPost({
        title: `Story ${random}`,
        slug: `story-${random}`,
        createdById: user.id,
        markdown: '',
        postType: 'story',
      })
      const feed = await insertTestRssFeedDirect({})
      const item = await createTestRssFeedItemWithUrl(feed.id)
      const story = await insertTestStory({ title: `Story ${random}` })
      await setTestItemStoryId(item.id, story.id)
      await insertTestPostStory(storyId, story.id, user.id)

      const request = createRequest()
      const response = await request
        .get(`/api/v1/posts?post_types=story&creator=${user.id}`)
        .expect(200)

      const postTypes = response.body.results.map(
        (r: { id: string }) => response.body.posts[r.id]?.post_type,
      )
      expect(postTypes.every((t: string) => t === 'story')).toBe(true)
      expect(response.body.results.map((r: { id: string }) => r.id)).toContain(storyId)
    })

    it('should support text search via q parameter', async () => {
      const unique = `uniquesearchterm${Math.random().toString(36).slice(2, 8)}`
      await insertTestPost({
        title: `Searchable Post ${unique}`,
        slug: `searchable-${unique}`,
        createdById: user.id,
        markdown: `This post contains ${unique} for testing`,
      })

      const request = createRequest()
      const response = await request.get(`/api/v1/posts?q=${unique}&sort=relevance`).expect(200)

      const titles = response.body.results.map(
        (r: { id: string }) => response.body.posts[r.id]?.title ?? '',
      )
      expect(titles.some((t: string) => t.includes(unique))).toBe(true)
    })

    it('accepts sort=hot and returns 200 with array results', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      await insertTestPost({
        title: `Hot Sort ${random}`,
        slug: `hot-sort-${random}`,
        createdById: user.id,
        markdown: 'Hot sort content',
      })

      const request = createRequest()
      const response = await request
        .get('/api/v1/posts')
        .query({ sort: 'hot', creator: user.id })
        .expect(200)

      expect(response.body.results).toBeInstanceOf(Array)
    })
  })
})
