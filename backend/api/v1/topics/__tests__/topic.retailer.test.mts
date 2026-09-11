import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { insertTestRetailer, getTestCountryId } from '@voucha/test-helpers/entities/retailers'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

describe('Topic Retailer Routes', () => {
  describe('GET /api/v1/topics/:idOrSlug/retailer', () => {
    it('should return retailer attributes', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Retailer ${random}`,
        slug: `test-retailer-get-${random}`,
        createdById: admin!.id,
        topicType: 'topic',
      })
      await insertTestRetailer({ topicId })
      const request = createRequest()

      const response = await request.get(`/api/v1/topics/${topicId}/retailer`).expect(200)

      expect(response.body.retailer_attributes).toBeDefined()
      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
      )
    })

    it('should return 404 for a topic without retailer attributes', async () => {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-ret-404-${random}`,
        createdById: user.id,
      })
      const request = createRequest()
      await request.get(`/api/v1/topics/${topicId}/retailer`).expect(404)
    })

    it('should return 404 for non-existent topic', async () => {
      const request = createRequest()
      await request.get('/api/v1/topics/00000000-0000-0000-0000-000000000000/retailer').expect(404)
    })

    it('should return 404 when retailer attributes are missing', async () => {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Retailer Missing ${random}`,
        slug: `test-retailer-missing-${random}`,
        createdById: user.id,
        topicType: 'topic',
      })
      const request = createRequest()
      await request.get(`/api/v1/topics/${topicId}/retailer`).expect(404)
    })
  })

  describe('PATCH /api/v1/topics/:idOrSlug/retailer', () => {
    it('should update retailer attributes when admin', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Retailer Patch ${random}`,
        slug: `test-retailer-patch-${random}`,
        createdById: admin!.id,
        topicType: 'topic',
      })
      const request = createRequest()
      await request.authenticateAs(admin!)

      const response = await request.patch(`/api/v1/topics/${topicId}/retailer`).expect(200)

      expect(response.body.retailer_attributes).toBeDefined()
    })

    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Retailer Auth ${random}`,
        slug: `test-retailer-auth-${random}`,
        createdById: user.id,
        topicType: 'topic',
      })
      const request = createRequest()
      await request.patch(`/api/v1/topics/${topicId}/retailer`).expect(401)
    })

    it('should return 403 when non-admin user', async () => {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Retailer Forbid ${random}`,
        slug: `test-retailer-forbid-${random}`,
        createdById: user.id,
        topicType: 'topic',
      })
      const request = createRequest()
      await request.authenticateAs(user)

      await request.patch(`/api/v1/topics/${topicId}/retailer`).expect(403)
    })
  })

  describe('GET /api/v1/topics/:idOrSlug/retailer/countries', () => {
    it('should return countries list', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Retailer Countries ${random}`,
        slug: `test-retailer-countries-${random}`,
        createdById: admin!.id,
        topicType: 'topic',
      })
      await insertTestRetailer({ topicId })
      const request = createRequest()

      const response = await request.get(`/api/v1/topics/${topicId}/retailer/countries`).expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.headers['cache-control']).toContain('public')
      expect(response.headers['cache-control']).toContain(
        `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
      )
    })

    it('should return 404 for a topic without retailer attributes', async () => {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-rctry-empty-${random}`,
        createdById: user.id,
      })
      const request = createRequest()
      await request.get(`/api/v1/topics/${topicId}/retailer/countries`).expect(404)
    })
  })

  describe('PUT /api/v1/topics/:idOrSlug/retailer/countries', () => {
    it('should update retailer countries when admin', async () => {
      const admin = await createTestUser({ administrator: true })
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Retailer PUT Countries ${random}`,
        slug: `test-retailer-put-ctry-${random}`,
        createdById: admin!.id,
        topicType: 'topic',
      })
      await insertTestRetailer({ topicId })
      const usCountryId = await getTestCountryId('US')
      const request = createRequest()
      await request.authenticateAs(admin!)

      const response = await request
        .put(`/api/v1/topics/${topicId}/retailer/countries`)
        .send({ country_ids: [usCountryId] })
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.results.length).toBe(1)
      expect(response.body.results[0].code).toBe('US')
    })

    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Retailer Countries Auth ${random}`,
        slug: `test-rctry-auth-${random}`,
        createdById: user.id,
        topicType: 'topic',
      })
      await insertTestRetailer({ topicId })
      const request = createRequest()

      await request
        .put(`/api/v1/topics/${topicId}/retailer/countries`)
        .send({ country_ids: [] })
        .expect(401)
    })

    it('should return 403 when non-admin user', async () => {
      const user = await createTestUser()
      const random = Math.random().toString(36).slice(2, 8)
      const topicId = await insertTestTopic({
        name: `Test Retailer Countries Forbid ${random}`,
        slug: `test-rctry-forbid-${random}`,
        createdById: user.id,
        topicType: 'topic',
      })
      await insertTestRetailer({ topicId })
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .put(`/api/v1/topics/${topicId}/retailer/countries`)
        .send({ country_ids: [] })
        .expect(403)
    })
  })
})
