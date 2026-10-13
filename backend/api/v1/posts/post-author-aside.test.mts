import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  insertTestPost,
  createTestUser,
  followUser,
  setUserMarkdown,
  setUserLanguageDetectionFieldsForTest,
} from '@voucha/test-helpers'

describe('post-author-aside', () => {
  let creator: PrivateUser
  let viewer: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
    viewer = await createTestUser()
    await followUser(viewer, creator)
  })

  describe('HEAD /api/v1/posts/:idOrSlug — author cache dependency', () => {
    it('returns the visible author tag without a body', async () => {
      const postId = await insertTestPost({
        title: 'Visible Author Dependency',
        slug: `visible-author-dependency-${crypto.randomUUID()}`,
        createdById: creator.id,
        markdown: 'content',
      })
      const response = await createRequest().head(`/api/v1/posts/${postId}`).expect(200)
      expect(response.headers['cache-tag']).toBe(`user:${creator.id}`)
      expect(response.text).toBeUndefined()
    })

    it('omits the tag for anonymous posts and rejects missing posts', async () => {
      const postId = await insertTestPost({
        title: 'Anonymous Author Dependency',
        slug: `anonymous-author-dependency-${crypto.randomUUID()}`,
        createdById: creator.id,
        markdown: 'content',
        isAnonymous: true,
      })
      const request = createRequest()
      const response = await request.head(`/api/v1/posts/${postId}`).expect(200)
      expect(response.headers['cache-tag']).toBeUndefined()
      await request.head(`/api/v1/posts/${crypto.randomUUID()}`).expect(404)
    })
  })

  describe('GET /api/v1/posts/:idOrSlug — author_aside', () => {
    it('should include author_aside null for anonymous posts', async () => {
      const postId = await insertTestPost({
        title: 'Anon Aside Test',
        slug: `anon-aside-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdById: creator.id,
        markdown: 'content',
        isAnonymous: true,
      })
      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${postId}`).expect(200)
      expect(response.body.author_aside).toBeNull()
      expect(response.headers['cache-tag']).toBeUndefined()
    })

    it('should include author_aside.is_following=true when viewer follows author', async () => {
      const postId = await insertTestPost({
        title: 'Follow Aside Test',
        slug: `follow-aside-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdById: creator.id,
        markdown: 'content',
      })
      const request = createRequest()
      await request.authenticateAs(viewer)
      const response = await request.get(`/api/v1/posts/${postId}`).expect(200)
      expect(response.body.author_aside).toBeTruthy()
      expect(response.body.author_aside.is_following).toBe(true)
      expect(response.body.author_aside.lingua_rs_detected_language).toBeNull()
      expect(response.headers['cache-tag']).toBe(`user:${creator.id}`)
    })

    it('should include author_aside.is_following=false when viewer is the author', async () => {
      const postId = await insertTestPost({
        title: 'Self Aside Test',
        slug: `self-aside-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdById: creator.id,
        markdown: 'content',
      })
      const request = createRequest()
      await request.authenticateAs(creator)
      const response = await request.get(`/api/v1/posts/${postId}`).expect(200)
      expect(response.body.author_aside.is_following).toBe(false)
    })

    it('should include author_aside with rendered about_html when author has bio', async () => {
      const bioCreator = await createTestUser()
      await setUserMarkdown(bioCreator.id, 'Hello **world**')
      await setUserLanguageDetectionFieldsForTest(bioCreator.id, 'ar')

      const postId = await insertTestPost({
        title: 'Bio Aside Test',
        slug: `bio-aside-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdById: bioCreator.id,
        markdown: 'content',
      })
      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${postId}`).expect(200)
      expect(response.body.author_aside.about_html).toContain('<p>')
      expect(response.body.author_aside.lingua_rs_detected_language).toBe('ar')
      expect(response.headers['cache-tag']).toBe(`user:${bioCreator.id}`)
      expect(Array.isArray(response.body.author_aside.profile_links)).toBe(true)
    })
  })
})
