import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  insertTestCard,
  insertTestBankAccount,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('posts.data-points', () => {
  let user: PrivateUser
  let cardTopicId: string
  let bankAccountTopicId: string

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    cardTopicId = await insertTestCard({ createdById: user.id })
    bankAccountTopicId = await insertTestBankAccount({ createdById: user.id })
  })

  const makeCreditCardPayload = (topicId: string) => ({
    post_type: 'data_point',
    title: 'Chase Sapphire Preferred approval',
    markdown: 'Got approved!',
    data_point_vertical: 'credit_card',
    structured_data: {
      vertical: 'credit_card',
      schema_version: 1,
      currency: 'usd',
      topic_ids: [topicId],
      result: 'approved',
      credit_score_range: '740-799',
      stated_income_range: {
        minimum: { amount: 7_500_000, currency: 'usd' },
        maximum: { amount: 10_000_000, currency: 'usd' },
      },
      hard_inquiries_12m: 2,
      cards_opened_24m: 3,
      credit_limit: { amount: 1_500_000, currency: 'usd' },
      application_method: 'online',
      application_date: '2026-03-15',
    },
  })

  const makeBankAccountPayload = () => ({
    post_type: 'data_point',
    title: 'Chase checking account approval',
    markdown: 'Applied and got approved.',
    data_point_vertical: 'bank_account',
    structured_data: {
      vertical: 'bank_account',
      schema_version: 1,
      currency: 'usd',
      topic_ids: [bankAccountTopicId],
      result: 'approved',
      account_type: 'checking',
      credit_score_range: '670-739',
      bonus_amount: { amount: 30_000, currency: 'usd' },
      bonus_requirements: 'Set up direct deposit within 90 days',
      direct_deposit_setup: false,
    },
  })

  describe('POST /api/v1/posts - data_point with structured data', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.post('/api/v1/posts').send(makeCreditCardPayload(cardTopicId)).expect(401)
    })

    it('creates a credit card data point post', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .post('/api/v1/posts')
        .send(makeCreditCardPayload(cardTopicId))
        .expect(201)

      const post = response.body.post
      expect(post.post_type).toBe('data_point')
      expect(post.data_point_vertical).toBe('credit_card')
      expect(post.structured_data.result).toBe('approved')
      expect(post.structured_data.credit_score_range).toBe('740-799')
      expect(post.structured_data.credit_limit).toEqual({ amount: 1_500_000, currency: 'usd' })
      expect(post.structured_data.application_method).toBe('online')
      expect(post.structured_data.schema_version).toBe(1)
    })

    it('creates a bank account data point post', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .post('/api/v1/posts')
        .send(makeBankAccountPayload())
        .expect(201)

      const post = response.body.post
      expect(post.post_type).toBe('data_point')
      expect(post.data_point_vertical).toBe('bank_account')
      expect(post.structured_data.result).toBe('approved')
      expect(post.structured_data.account_type).toBe('checking')
      expect(post.structured_data.bonus_amount).toEqual({ amount: 30_000, currency: 'usd' })
      expect(post.structured_data.schema_version).toBe(1)
    })

    it('returns 422 for invalid structured_data vertical', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .post('/api/v1/posts')
        .send({
          ...makeCreditCardPayload(cardTopicId),
          data_point_vertical: 'mortgage',
          structured_data: {
            vertical: 'mortgage',
            schema_version: 1,
            topic_ids: [cardTopicId],
            result: 'approved',
          },
        })
        .expect(422)
    })

    it('returns 422 for mismatched vertical in structured_data', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .post('/api/v1/posts')
        .send({
          ...makeCreditCardPayload(cardTopicId),
          data_point_vertical: 'credit_card',
          structured_data: {
            vertical: 'bank_account',
            schema_version: 1,
            topic_ids: [cardTopicId],
            result: 'approved',
          },
        })
        .expect(422)
    })

    it('returns 422 for invalid credit_card result', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .post('/api/v1/posts')
        .send({
          ...makeCreditCardPayload(cardTopicId),
          structured_data: {
            vertical: 'credit_card',
            schema_version: 1,
            topic_ids: [cardTopicId],
            result: 'unknown_result',
            credit_score_range: '670-739',
          },
        })
        .expect(422)
    })

    it('returns 422 for missing required credit_score_range on credit card', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .post('/api/v1/posts')
        .send({
          ...makeCreditCardPayload(cardTopicId),
          structured_data: {
            vertical: 'credit_card',
            schema_version: 1,
            topic_ids: [cardTopicId],
            result: 'approved',
            // credit_score_range omitted
          },
        })
        .expect(422)
    })
  })

  describe('GET /api/v1/posts - filter by data_point_vertical', () => {
    it('filters posts by data_point_vertical=credit_card', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      // Create a credit card data point to ensure at least one exists
      await request.post('/api/v1/posts').send(makeCreditCardPayload(cardTopicId)).expect(201)

      const response = await request
        .get(`/api/v1/posts?data_point_vertical=credit_card&creator=${user.id}`)
        .expect(200)

      expect(Array.isArray(response.body.results)).toBe(true)
      const postIds = response.body.results.map((r: { id: string }) => r.id)
      for (const id of postIds) {
        expect(response.body.posts[id].data_point_vertical).toBe('credit_card')
      }
    })

    it('returns structured_data in post response', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      const createResponse = await request
        .post('/api/v1/posts')
        .send(makeCreditCardPayload(cardTopicId))
        .expect(201)

      const postId = createResponse.body.post.id

      const getResponse = await request
        .get(`/api/v1/posts?creator=${user.id}&post_types=data_point`)
        .expect(200)

      expect(getResponse.body.posts[postId]).toBeDefined()
      expect(getResponse.body.posts[postId].structured_data).toBeDefined()
      expect(getResponse.body.posts[postId].data_point_vertical).toBe('credit_card')
    })
  })
})
