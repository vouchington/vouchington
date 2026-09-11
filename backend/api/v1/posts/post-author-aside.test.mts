import { describe, it, expect, beforeAll } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/api/test-helpers/server'
import { insertTestPost, createTestUser, followUser, setUserMarkdown } from '@voucha/test-helpers'

describe('post-author-aside', () => {
  let creator: PrivateUser
  let viewer: PrivateUser

  beforeAll(async () => {
    creator = await createTestUser()
    viewer = await createTestUser()
    await followUser(viewer, creator)
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

      const postId = await insertTestPost({
        title: 'Bio Aside Test',
        slug: `bio-aside-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdById: bioCreator.id,
        markdown: 'content',
      })
      const request = createRequest()
      const response = await request.get(`/api/v1/posts/${postId}`).expect(200)
      expect(response.body.author_aside.about_html).toContain('<p>')
      expect(Array.isArray(response.body.author_aside.profile_links)).toBe(true)
    })
  })
})
