import { describe, it, expect, afterAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

describe('topic.card', () => {
  afterAll(async () => {}, 30000) // Increased timeout for cleanup when Playwright test data exists

  describe('Topic Card Routes', () => {
    describe('GET /api/v1/topics/:idOrSlug/card', () => {
      it('should return card attributes for card topic', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const cardTopicId = await insertTestTopic({
          name: `Test Card ${random}`,
          slug: `test-card-get-${random}`,
          createdById: admin!.id,
          topicType: 'card',
        })
        const bankTopicId = await insertTestTopic({
          name: `Test Bank ${random}`,
          slug: `test-bank-get-${random}`,
          createdById: admin!.id,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .patch(`/api/v1/topics/${cardTopicId}/card`)
          .send({
            bank_id: bankTopicId,
            annual_fee: { amount: 9500, currency: 'usd' },
          })
          .expect(200)

        const anonymousRequest = createRequest()
        const response = await anonymousRequest
          .get(`/api/v1/topics/${cardTopicId}/card`)
          .expect(200)

        expect(response.body.card_attributes.bank_id).toBe(bankTopicId)
        expect(response.body.card_attributes.annual_fee).toEqual({
          amount: 9500,
          currency: 'usd',
        })
        expect(response.headers['cache-control']).toContain('public')
        expect(response.headers['cache-control']).toContain(
          `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
        )
      })

      it('should return 400 for non-card topic', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-card-400-${random}`,
          createdById: user!.id,
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${topicId}/card`).expect(400)
      })

      it('should return 404 for non-existent topic', async () => {
        const request = createRequest()
        await request.get('/api/v1/topics/00000000-0000-0000-0000-000000000000/card').expect(404)
      })

      it('should return 404 when card attributes are missing', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const cardTopicId = await insertTestTopic({
          name: `Test Card ${random}`,
          slug: `test-card-missing-${random}`,
          createdById: user!.id,
          topicType: 'card',
        })
        const request = createRequest()
        await request.get(`/api/v1/topics/${cardTopicId}/card`).expect(404)
      })
    })

    describe('PATCH /api/v1/topics/:idOrSlug/card', () => {
      it('should update card attributes when authenticated', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const cardTopicId = await insertTestTopic({
          name: `Test Card ${random}`,
          slug: `test-card-patch-${random}`,
          createdById: admin!.id,
          topicType: 'card',
        })
        const bankTopicId = await insertTestTopic({
          name: `Test Bank ${random}`,
          slug: `test-bank-${random}`,
          createdById: admin!.id,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        const response = await request
          .patch(`/api/v1/topics/${cardTopicId}/card`)
          .send({
            bank_id: bankTopicId,
            annual_fee: { amount: 9500, currency: 'usd' },
          })
          .expect(200)

        expect(response.body.card_attributes.bank_id).toBe(bankTopicId)
        expect(response.body.card_attributes.annual_fee).toEqual({
          amount: 9500,
          currency: 'usd',
        })
      })

      it('rejects a scaled annual fee without changing card attributes', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const cardTopicId = await insertTestTopic({
          name: `Test Card ${random}`,
          slug: `test-card-exact-money-${random}`,
          createdById: admin.id,
          topicType: 'card',
        })
        const request = createRequest()
        await request.authenticateAs(admin)
        await request
          .patch(`/api/v1/topics/${cardTopicId}/card`)
          .send({ annual_fee: { amount: 9500, currency: 'usd' } })
          .expect(200)

        await request
          .patch(`/api/v1/topics/${cardTopicId}/card`)
          .send({ annual_fee: { amount: 9500, currency: 'usd', scale: 6 } })
          .expect(422)

        const response = await request.get(`/api/v1/topics/${cardTopicId}/card`).expect(200)
        expect(response.body.card_attributes.annual_fee).toEqual({
          amount: 9500,
          currency: 'usd',
        })
      })

      it('should return 401 when not authenticated', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const cardTopicId = await insertTestTopic({
          name: `Test Card ${random}`,
          slug: `test-card-patch-401-${random}`,
          createdById: user!.id,
          topicType: 'card',
        })
        const request = createRequest()
        await request
          .patch(`/api/v1/topics/${cardTopicId}/card`)
          .send({ annual_fee: { amount: 100, currency: 'jpy' } })
          .expect(401)
      })

      it('should return 403 when user is not admin', async () => {
        const user = await createTestUser()
        const random = Math.random().toString(36).slice(2, 8)
        const cardTopicId = await insertTestTopic({
          name: `Test Card ${random}`,
          slug: `test-card-patch-403-${random}`,
          createdById: user!.id,
          topicType: 'card',
        })
        const request = createRequest()
        await request.authenticateAs(user!)

        await request
          .patch(`/api/v1/topics/${cardTopicId}/card`)
          .send({ annual_fee: { amount: 100, currency: 'jpy' } })
          .expect(403)
      })

      it('should return 400 for non-card topic', async () => {
        const admin = await createTestUser({ administrator: true })
        const random = Math.random().toString(36).slice(2, 8)
        const topicId = await insertTestTopic({
          name: `Test Topic ${random}`,
          slug: `test-topic-patch-card-400-${random}`,
          createdById: admin!.id,
        })
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .patch(`/api/v1/topics/${topicId}/card`)
          .send({ annual_fee: { amount: 100, currency: 'jpy' } })
          .expect(400)
      })

      it('should return 404 for non-existent topic', async () => {
        const admin = await createTestUser({ administrator: true })
        const request = createRequest()
        await request.authenticateAs(admin!)

        await request
          .patch('/api/v1/topics/00000000-0000-0000-0000-000000000000/card')
          .send({ annual_fee: { amount: 100, currency: 'jpy' } })
          .expect(404)
      })
    })
  })
})
