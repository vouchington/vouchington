import { describe, it, expect, afterAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

describe('topic.rewards-program-status', () => {
  afterAll(async () => {}, 30000) // Increased timeout for cleanup when Playwright test data exists

  describe('Topic Rewards Program Status Routes', () => {
    describe('GET /api/v1/topics/:idOrSlug/rewards-program-status', () => {
      it('should return rewards program status attributes', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Status ${random}`,
          slug: `test-status-${random}`,
          createdById: admin!.id,
          topicType: 'rewards_program_status',
        })
        const rewardsProgramId = await insertTestTopic({
          name: `Test Rewards Program ${random}`,
          slug: `test-rewards-status-get-${random}`,
          createdById: admin!.id,
          topicType: 'rewards_program',
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        // Create the rewards program extension row
        await request
          .patch(`/api/v1/topics/${rewardsProgramId}/rewards-program`)
          .send({ company_id: null })
          .expect(200)

        // Set rewards_program_id on the status topic itself
        await request
          .patch(`/api/v1/topics/${topicId}`)
          .send({ rewards_program_id: rewardsProgramId })
          .expect(200)

        // Create the status extension with order_index
        await request
          .patch(`/api/v1/topics/${topicId}/rewards-program-status`)
          .send({ order_index: 3 })
          .expect(200)

        const response = await request
          .get(`/api/v1/topics/${topicId}/rewards-program-status`)
          .expect(200)

        expect(response.body.rewards_program_status_attributes.order_index).toBe(3)
        expect(response.headers['cache-control']).toBe(
          `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
        )

        // rewards_program_id is now on the topic, not the status attributes
        const topicResponse = await request.get(`/api/v1/topics/${topicId}`).expect(200)
        expect(topicResponse.body.topic.rewards_program_id).toBe(rewardsProgramId)
      })

      it('should return 400 for non-status topic', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-status-400-${random}`,
          createdById: user!.id,
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/rewards-program-status`).expect(400)
      })

      it('should return 404 when rewards program status attributes are missing', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Status ${random}`,
          slug: `test-status-missing-${random}`,
          createdById: user!.id,
          topicType: 'rewards_program_status',
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/rewards-program-status`).expect(404)
      })
    })

    describe('PATCH /api/v1/topics/:idOrSlug/rewards-program-status', () => {
      it('should update rewards program status attributes when authenticated', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Status ${random}`,
          slug: `test-status-patch-${random}`,
          createdById: admin!.id,
          topicType: 'rewards_program_status',
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        const response = await request
          .patch(`/api/v1/topics/${topicId}/rewards-program-status`)
          .send({ order_index: 5 })
          .expect(200)

        expect(response.body.rewards_program_status_attributes.order_index).toBe(5)
      })

      it('should return 422 when lifetime version is for a different rewards program', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const statusId = await insertTestTopic({
          name: `Test Status ${random}`,
          slug: `test-status-lifetime-${random}`,
          createdById: admin!.id,
          topicType: 'rewards_program_status',
        })
        const otherStatusId = await insertTestTopic({
          name: `Test Status Other ${random}`,
          slug: `test-status-lifetime-other-${random}`,
          createdById: admin!.id,
          topicType: 'rewards_program_status',
        })
        const rewardsProgramId = await insertTestTopic({
          name: `Test Rewards Program ${random}`,
          slug: `test-rewards-lifetime-${random}`,
          createdById: admin!.id,
          topicType: 'rewards_program',
        })
        const otherRewardsProgramId = await insertTestTopic({
          name: `Test Rewards Program Other ${random}`,
          slug: `test-rewards-lifetime-other-${random}`,
          createdById: admin!.id,
          topicType: 'rewards_program',
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        // Create the rewards program extension rows
        await request
          .patch(`/api/v1/topics/${rewardsProgramId}/rewards-program`)
          .send({ company_id: null })
          .expect(200)
        await request
          .patch(`/api/v1/topics/${otherRewardsProgramId}/rewards-program`)
          .send({ company_id: null })
          .expect(200)

        // Set rewards_program_id on each status topic via the topic update endpoint
        await request
          .patch(`/api/v1/topics/${statusId}`)
          .send({ rewards_program_id: rewardsProgramId })
          .expect(200)
        await request
          .patch(`/api/v1/topics/${otherStatusId}`)
          .send({ rewards_program_id: otherRewardsProgramId })
          .expect(200)

        // Create status extension rows
        await request
          .patch(`/api/v1/topics/${statusId}/rewards-program-status`)
          .send({ order_index: 1 })
          .expect(200)
        await request
          .patch(`/api/v1/topics/${otherStatusId}/rewards-program-status`)
          .send({ order_index: 1 })
          .expect(200)

        // Trying to set a lifetime_version from a different rewards program should 422
        await request
          .patch(`/api/v1/topics/${statusId}/rewards-program-status`)
          .send({ lifetime_version_id: otherStatusId })
          .expect(422)
      })

      it('should return 401 when not authenticated', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Status ${random}`,
          slug: `test-status-401-${random}`,
          createdById: user!.id,
          topicType: 'rewards_program_status',
        })
        const request = createRequest()
        await request
          .patch(`/api/v1/topics/${topicId}/rewards-program-status`)
          .send({ order_index: 1 })
          .expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Status ${random}`,
          slug: `test-status-403-${random}`,
          createdById: user!.id,
          topicType: 'rewards_program_status',
        })
        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .patch(`/api/v1/topics/${topicId}/rewards-program-status`)
          .send({ order_index: 1 })
          .expect(403)
      })
    })
  })
})
