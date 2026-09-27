import { beforeAll, describe, expect, it } from 'vitest'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  dataPointFactConstraintCode,
  insertTestCard,
  insertTestTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createPost } from '../posts/create.mts'
import { getPostByAny } from '../posts/get.mts'
import { randomUUID } from 'node:crypto'

describe('data point fact storage', () => {
  let creator: PrivateUser
  let cardA: string
  let cardB: string
  let bankTopic: string

  beforeAll(async () => {
    creator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const suffix = randomUUID().slice(0, 8)
    cardA = await insertTestCard({ createdById: creator.id })
    cardB = await insertTestCard({ createdById: creator.id })
    bankTopic = await insertTestTopic({
      name: `Bank fact topic ${suffix}`,
      slug: `bank-fact-topic-${suffix}`,
      createdById: creator.id,
      topicType: 'bank_account',
    })
  })

  it('reconstructs ordered topic ids and distinguishes omitted keys from null', async () => {
    const omitted = await createPost(creator, {
      post_type: 'data_point',
      title: `Omitted facts ${randomUUID().slice(0, 8)}`,
      data_point_vertical: 'credit_card',
      structured_data: {
        vertical: 'credit_card',
        schema_version: 1,
        currency: 'usd',
        topic_ids: [cardB, cardA],
        result: 'denied',
        credit_score_range: '580-669',
      },
    })
    const explicit = await createPost(creator, {
      post_type: 'data_point',
      title: `Explicit null facts ${randomUUID().slice(0, 8)}`,
      data_point_vertical: 'credit_card',
      structured_data: {
        vertical: 'credit_card',
        schema_version: 1,
        currency: 'usd',
        topic_ids: [cardA],
        result: 'approved',
        credit_score_range: '740-799',
        stated_income_range: {
          minimum: { amount: 50_000, currency: 'usd' },
          maximum: null,
        },
        existing_relationship: true,
        hard_inquiries_12m: null,
        cards_opened_24m: 2,
        credit_limit: { amount: 1_500_000, currency: 'usd' },
        total_credit_limit_all_cards: null,
        years_of_credit_history: 0,
        is_business_application: false,
        application_method: null,
        application_date: '2024-01-15',
      },
    })
    const bank = await createPost(creator, {
      post_type: 'data_point',
      title: `Bank facts ${randomUUID().slice(0, 8)}`,
      data_point_vertical: 'bank_account',
      structured_data: {
        vertical: 'bank_account',
        schema_version: 1,
        currency: 'eur',
        topic_ids: [bankTopic],
        result: 'sign_up_bonus',
        account_type: null,
        credit_score_range: '670-739',
        stated_income_range: null,
        existing_relationship: false,
        bonus_amount: { amount: 10, currency: 'eur' },
        bonus_requirements: 'direct deposit',
        minimum_balance_requirement: null,
        direct_deposit_setup: true,
        application_date: null,
      },
    })

    const omittedData = (await getPostByAny(omitted.id))!.structured_data as Record<string, unknown>
    const explicitData = (await getPostByAny(explicit.id))!.structured_data as Record<
      string,
      unknown
    >
    const bankData = (await getPostByAny(bank.id))!.structured_data as Record<string, unknown>

    expect(omittedData.topic_ids).toEqual([cardB, cardA])
    expect(omittedData).not.toHaveProperty('credit_limit')
    expect(omittedData).not.toHaveProperty('stated_income_range')
    expect(omittedData).not.toHaveProperty('hard_inquiries_12m')
    expect(omittedData).not.toHaveProperty('existing_relationship')
    expect(explicitData).toMatchObject({
      vertical: 'credit_card',
      schema_version: 1,
      result: 'approved',
      currency: 'usd',
      topic_ids: [cardA],
      credit_score_range: '740-799',
      stated_income_range: {
        minimum: { amount: 50_000, currency: 'usd' },
        maximum: null,
      },
      existing_relationship: true,
      hard_inquiries_12m: null,
      cards_opened_24m: 2,
      credit_limit: { amount: 1_500_000, currency: 'usd' },
      total_credit_limit_all_cards: null,
      years_of_credit_history: 0,
      is_business_application: false,
      application_method: null,
      application_date: '2024-01-15',
    })
    expect(bankData).toMatchObject({
      vertical: 'bank_account',
      result: 'sign_up_bonus',
      currency: 'eur',
      topic_ids: [bankTopic],
      account_type: null,
      credit_score_range: '670-739',
      stated_income_range: null,
      bonus_amount: { amount: 10, currency: 'eur' },
      bonus_requirements: 'direct deposit',
      minimum_balance_requirement: null,
      direct_deposit_setup: true,
      application_date: null,
      existing_relationship: false,
    })
    expect(bankData).not.toHaveProperty('credit_limit')
    expect(bankData).not.toHaveProperty('is_business_application')
  })

  it('rejects a missing post, a vertical mismatch, and a duplicate topic order', async () => {
    const missingPost = await dataPointFactConstraintCode(
      `INSERT INTO post_data_point_facts (
        post_id, vertical, result, currency, credit_score_range, credit_score_range_presence
      ) VALUES ($1, 'credit_card', 'approved', 'usd', '670-739', 'present')`,
      [randomUUID()],
    )
    expect(missingPost).toBe('23503')

    const post = await createPost(creator, {
      post_type: 'data_point',
      title: `Constraint facts ${randomUUID().slice(0, 8)}`,
      data_point_vertical: 'credit_card',
      structured_data: {
        vertical: 'credit_card',
        schema_version: 1,
        currency: 'usd',
        topic_ids: [cardA],
        result: 'approved',
        credit_score_range: '740-799',
      },
    })
    const mismatch = await dataPointFactConstraintCode(
      `UPDATE post_data_point_facts SET vertical = 'bank_account' WHERE post_id = $1`,
      [post.id],
    )
    expect(mismatch).toBe('23514')
    const duplicateOrder = await dataPointFactConstraintCode(
      `INSERT INTO post_data_point_topics (post_id, topic_id, order_index) VALUES ($1, $2, 0)`,
      [post.id, cardB],
    )
    expect(duplicateOrder).toBe('23505')
  })
})
