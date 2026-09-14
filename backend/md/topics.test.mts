import { describe, it, expect, beforeAll } from 'vitest'
import { caches } from '@services/entity-cache/caches'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
// Register this package routes on the shared app singleton for route tests.
import './index.mts'
import {
  insertTestTopic,
  createTestUser,
  softDeleteTopic,
  updateTopicSlugForTest,
} from '@voucha/test-helpers'

describe('topics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  describe('GET /md/topics', () => {
    it('should return text/markdown content type', async () => {
      const request = createRequest()
      const response = await request.get('/md/topics').expect(200)
      expect(response.headers['content-type']).toContain('text/markdown')
    })

    it('should return markdown with frontmatter', async () => {
      const request = createRequest()
      const response = await request.get('/md/topics').expect(200)
      expect(response.text).toMatch(/^---/)
      expect(response.text).toContain('has_next_page')
    })

    it('should return markdown listing structure', async () => {
      const request = createRequest()
      const response = await request.get('/md/topics').expect(200)
      expect(response.text).toMatch(/^---/)
      expect(response.text).toContain('has_next_page')
      // response should have markdown headings for topics
      expect(response.text).toContain('## [')
    })

    it('uses singular topic routes in markdown listings', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `card-md-topic-${random}`
      await insertTestTopic({
        name: `Card MD Topic ${random}`,
        slug,
        createdById: user.id,
        topicType: 'card',
      })
      const request = createRequest()
      const response = await request.get(`/md/topics?slugs=${slug}`).expect(200)
      expect(response.text).toContain(`https://voucha.ai/card/${slug}`)
      expect(response.text).not.toContain(`https://voucha.ai/cards/${slug}`)
    })

    it('should support pagination with limit', async () => {
      const request = createRequest()
      const response = await request.get('/md/topics?limit=2').expect(200)
      expect(response.text).toMatch(/^---/)
      expect(response.headers['content-type']).toContain('text/markdown')
    })

    it('should set Cache-Control header with max-age=60', async () => {
      const request = createRequest()
      const response = await request.get('/md/topics').expect(200)
      expect(response.headers['cache-control']).toBe('public, max-age=60')
    })

    it('returns ETag header', async () => {
      const request = createRequest()
      const response = await request.get('/md/topics').expect(200)
      expect(response.headers['etag']).toMatch(/^"[A-Za-z0-9_-]+"$/)
    })

    it('returns 304 for matching If-None-Match', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `etag-md-topic-${random}`
      await insertTestTopic({
        name: `ETag MD Topic ${random}`,
        slug,
        createdById: user.id,
      })
      const request = createRequest()
      const path = `/md/topics?slugs=${slug}`
      const res1 = await request.get(path).expect(200)
      const etag = res1.headers['etag']
      await request.get(path).set('If-None-Match', etag).expect(304)
    })

    it('omits noindex topics from markdown listings', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `noindex-md-topic-${random}`
      await insertTestTopic({
        name: `Noindex MD Topic ${random}`,
        slug,
        createdById: user.id,
        noindex: true,
      })
      const request = createRequest()
      const response = await request.get(`/md/topics?slugs=${slug}`).expect(200)
      expect(response.text).not.toContain(`Noindex MD Topic ${random}`)
      expect(response.text).not.toContain(slug)
    })
  })

  describe('GET /md/topics/:idOrSlug', () => {
    it('should return 404 for non-existent topic', async () => {
      const request = createRequest()
      await request.get('/md/topics/does-not-exist-topic-xyz').expect(404)
    })

    it('should return text/markdown for an existing topic', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Detail MD Topic ${random}`,
        slug: `detail-md-topic-${random}`,
        createdById: user.id,
      })
      const request = createRequest()
      const response = await request.get(`/md/topics/${topicId}`).expect(200)
      expect(response.headers['content-type']).toContain('text/markdown')
      expect(response.text).toMatch(/^---/)
      expect(response.text).toContain('name')
      expect(response.text).toContain(`Detail MD Topic ${random}`)
    })

    it('uses singular topic routes in detail frontmatter', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `rewards-program-md-topic-${random}`
      const topicId = await insertTestTopic({
        name: `Rewards Program MD Topic ${random}`,
        slug,
        createdById: user.id,
        topicType: 'rewards_program',
      })
      const request = createRequest()
      const response = await request.get(`/md/topics/${topicId}`).expect(200)
      expect(response.text).toContain(`url: "https://voucha.ai/rewards-program/${slug}"`)
      expect(response.text).not.toContain(`https://voucha.ai/rewards-programs/${slug}`)
    })

    it('enforces detail topic type constraints', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Typed Constraint MD Topic ${random}`,
        slug: `typed-constraint-md-topic-${random}`,
        createdById: user.id,
        topicType: 'rewards_program',
      })
      const request = createRequest()
      await request.get(`/md/topics/${topicId}?topic_types=card`).expect(404)
      await request.get(`/md/topics/${topicId}?topic_types=rewards_program`).expect(200)
    })

    it('should return topic by slug', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `slug-md-topic-${random}`
      await insertTestTopic({
        name: `Slug MD Topic ${random}`,
        slug,
        createdById: user.id,
      })
      const request = createRequest()
      const response = await request.get(`/md/topics/${slug}`).expect(200)
      expect(response.text).toContain(`Slug MD Topic ${random}`)
    })

    it('uses cached slug resolution before fetching the canonical topic for markdown details', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const slug = `cached-resolution-md-topic-${random}`
      const topicId = await insertTestTopic({
        name: `Cached Resolution MD Topic ${random}`,
        slug,
        createdById: user.id,
      })
      await caches.topics_lookup.set(slug, topicId)
      await updateTopicSlugForTest(topicId, `cached-resolution-md-topic-new-${random}`)

      const request = createRequest()
      const response = await request.get(`/md/topics/${slug}`).expect(200)
      expect(response.text).toContain(`Cached Resolution MD Topic ${random}`)
    })

    it('should set Cache-Control header with max-age=300', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Cache MD Topic ${random}`,
        slug: `cache-md-topic-${random}`,
        createdById: user.id,
      })
      const request = createRequest()
      const response = await request.get(`/md/topics/${topicId}`).expect(200)
      expect(response.headers['cache-control']).toBe('public, max-age=300')
    })

    it('returns ETag header for detail page', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `ETag MD Topic ${random}`,
        slug: `etag-md-topic-${random}`,
        createdById: user.id,
      })
      const request = createRequest()
      const response = await request.get(`/md/topics/${topicId}`).expect(200)
      expect(response.headers['etag']).toMatch(/^"[A-Za-z0-9_-]+"$/)
    })

    it('returns 304 for matching If-None-Match on detail page', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `304 MD Topic ${random}`,
        slug: `304-md-topic-${random}`,
        createdById: user.id,
      })
      const request = createRequest()
      const res1 = await request.get(`/md/topics/${topicId}`).expect(200)
      const etag = res1.headers['etag']
      await request.get(`/md/topics/${topicId}`).set('If-None-Match', etag).expect(304)
    })

    it('returns 404 for noindex topics', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Noindex Detail MD Topic ${random}`,
        slug: `noindex-detail-md-topic-${random}`,
        createdById: user.id,
        noindex: true,
      })
      const request = createRequest()
      await request.get(`/md/topics/${topicId}`).expect(404)
    })

    it('returns 404 for deleted topics', async () => {
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Deleted Detail MD Topic ${random}`,
        slug: `deleted-detail-md-topic-${random}`,
        createdById: user.id,
      })
      await softDeleteTopic(topicId, user.id)
      const request = createRequest()
      await request.get(`/md/topics/${topicId}`).expect(404)
    })
  })
})
