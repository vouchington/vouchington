import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

describe('topic.spending-category', () => {
  let admin: Awaited<ReturnType<typeof createTestUser>> | null = null
  let user: Awaited<ReturnType<typeof createTestUser>> | null = null
  let topicWithAttributesId: string
  let topicWithoutAttributesId: string
  let topicForUnauthorizedPatchId: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 8)
    topicWithAttributesId = await insertTestTopic({
      name: `Test Topic ${random}`,
      slug: `test-topic-spending-${random}`,
      createdById: admin!.id,
    })
    topicWithoutAttributesId = await insertTestTopic({
      name: `Test Topic Missing ${random}`,
      slug: `test-topic-spending-missing-${random}`,
      createdById: user!.id,
    })
    topicForUnauthorizedPatchId = await insertTestTopic({
      name: `Test Topic Unauthorized ${random}`,
      slug: `test-topic-spending-unauthorized-${random}`,
      createdById: user!.id,
    })
  }, 30_000)

  describe('Topic Spending Category Routes', () => {
    describe('GET /api/v1/topics/:idOrSlug/spending-category', () => {
      it('should return spending category attributes', async () => {
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .patch(`/api/v1/topics/${topicWithAttributesId}/spending-category`)
          .send({
            is_foreign_transaction: true,
            default_spending_frequency: 'annually',
          })
          .expect(200)

        const response = await request
          .get(`/api/v1/topics/${topicWithAttributesId}/spending-category`)
          .expect(200)

        expect(response.body.spending_category_attributes.is_foreign_transaction).toBe(true)
        expect(response.body.spending_category_attributes.default_spending_frequency).toBe(
          'annually',
        )
        expect(response.headers['cache-control']).toBe(
          `public, max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
        )
      })

      it('should return 404 when spending category attributes are missing', async () => {
        const request = createRequest()
        await request
          .get(`/api/v1/topics/${topicWithoutAttributesId}/spending-category`)
          .expect(404)
      })
    })

    describe('PATCH /api/v1/topics/:idOrSlug/spending-category', () => {
      it('should update spending category attributes when authenticated', async () => {
        const request = createRequest()
        await request.authenticateAs(admin!)

        const response = await request
          .patch(`/api/v1/topics/${topicWithAttributesId}/spending-category`)
          .send({
            is_foreign_transaction: true,
            default_spending_frequency: 'annually',
          })
          .expect(200)

        expect(response.body.spending_category_attributes.is_foreign_transaction).toBe(true)
        expect(response.body.spending_category_attributes.default_spending_frequency).toBe(
          'annually',
        )
      })

      it('should return 401 when not authenticated', async () => {
        const request = createRequest()
        await request
          .patch(`/api/v1/topics/${topicForUnauthorizedPatchId}/spending-category`)
          .send({ is_foreign_transaction: true })
          .expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .patch(`/api/v1/topics/${topicForUnauthorizedPatchId}/spending-category`)
          .send({ is_foreign_transaction: true })
          .expect(403)
      })
    })

    describe('PUT /api/v1/topics/:idOrSlug/spending-category', () => {
      it('should replace existing spending category attributes', async () => {
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .patch(`/api/v1/topics/${topicWithAttributesId}/spending-category`)
          .send({
            is_foreign_transaction: true,
            default_spending_frequency: 'annually',
          })
          .expect(200)

        const replaceResponse = await request
          .put(`/api/v1/topics/${topicWithAttributesId}/spending-category`)
          .send({
            is_foreign_transaction: false,
          })
          .expect(200)

        expect(replaceResponse.body.spending_category_attributes.is_foreign_transaction).toBe(false)
        expect(replaceResponse.body.spending_category_attributes.default_spending_frequency).toBe(
          'monthly',
        )

        const getResponse = await request
          .get(`/api/v1/topics/${topicWithAttributesId}/spending-category`)
          .expect(200)
        expect(getResponse.body.spending_category_attributes.is_foreign_transaction).toBe(false)
        expect(getResponse.body.spending_category_attributes.default_spending_frequency).toBe(
          'monthly',
        )
      })
    })
  })
})
