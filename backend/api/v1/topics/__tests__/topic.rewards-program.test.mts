import { describe, it, expect, afterAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

describe('topic.rewards-program', () => {
  afterAll(async () => {}, 30000) // Increased timeout for cleanup when Playwright test data exists

  describe('Topic Rewards Program Routes', () => {
    describe('GET /api/v1/topics/:idOrSlug/rewards-program', () => {
      it('should return rewards program attributes', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Rewards Program ${random}`,
          slug: `test-rewards-${random}`,
          createdById: admin!.id,
          topicType: 'rewards_program',
        })
        const companyId = await insertTestTopic({
          name: `Test Company ${random}`,
          slug: `test-company-get-${random}`,
          createdById: admin!.id,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .patch(`/api/v1/topics/${topicId}/rewards-program`)
          .send({ company_id: companyId })
          .expect(200)

        const response = await request.get(`/api/v1/topics/${topicId}/rewards-program`).expect(200)

        expect(response.body.rewards_program_attributes.company_id).toBe(companyId)
        expect(response.headers['cache-control']).toBe(
          `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
        )
      })

      it('should return 400 for non-rewards-program topic', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-rewards-400-${random}`,
          createdById: user!.id,
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/rewards-program`).expect(400)
      })

      it('should return 404 when rewards program attributes are missing', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Rewards Program ${random}`,
          slug: `test-rewards-missing-${random}`,
          createdById: user!.id,
          topicType: 'rewards_program',
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/rewards-program`).expect(404)
      })
    })

    describe('PATCH /api/v1/topics/:idOrSlug/rewards-program', () => {
      it('should update rewards program attributes when authenticated', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Rewards Program ${random}`,
          slug: `test-rewards-patch-${random}`,
          createdById: admin!.id,
          topicType: 'rewards_program',
        })
        const companyId = await insertTestTopic({
          name: `Test Company ${random}`,
          slug: `test-company-${random}`,
          createdById: admin!.id,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        const response = await request
          .patch(`/api/v1/topics/${topicId}/rewards-program`)
          .send({ company_id: companyId })
          .expect(200)

        expect(response.body.rewards_program_attributes.company_id).toBe(companyId)
      })

      it('should return 401 when not authenticated', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Rewards Program ${random}`,
          slug: `test-rewards-401-${random}`,
          createdById: user!.id,
          topicType: 'rewards_program',
        })
        const request = createRequest()
        await request
          .patch(`/api/v1/topics/${topicId}/rewards-program`)
          .send({ company_id: null })
          .expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Rewards Program ${random}`,
          slug: `test-rewards-403-${random}`,
          createdById: user!.id,
          topicType: 'rewards_program',
        })
        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .patch(`/api/v1/topics/${topicId}/rewards-program`)
          .send({ company_id: null })
          .expect(403)
      })
    })
  })
})
