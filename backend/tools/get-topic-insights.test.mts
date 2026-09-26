import { beforeAll, describe, expect, it } from 'vitest'
import getTopicInsightsTool from './get-topic-insights.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'

describe('get_topic_insights tool — real DB', () => {
  let user: PrivateUser
  let topicId: string
  const suffix = crypto.randomUUID().slice(0, 8)

  beforeAll(async () => {
    user = await createTestUser()
    topicId = await insertTestTopic({
      name: `Insights Tool Topic ${suffix}`,
      slug: `insights-tool-topic-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })

    await insertTestDataPoint({
      title: `Tool Insights Approved ${suffix}`,
      slug: `ti-approved-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'approved',
      creditScoreRange: '670-739',
      creditLimit: { amount: 1_000_000, currency: 'usd' },
    })
    await insertTestDataPoint({
      title: `Tool Insights Denied ${suffix}`,
      slug: `ti-denied-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'denied',
      creditScoreRange: '580-669',
    })
  })

  it('returns topic_id in result', async () => {
    const execute = getTopicInsightsTool.function(user)
    const result = await execute({ topic_id: topicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.topic_id).toBe(topicId)
  })

  it('returns correct aggregate statistics', async () => {
    const execute = getTopicInsightsTool.function(user)
    const result = await execute({ topic_id: topicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.total_count).toBeGreaterThanOrEqual(2)
    expect(result.approved_count).toBeGreaterThanOrEqual(1)
    expect(result.denied_count).toBeGreaterThanOrEqual(1)
    expect(result.approval_rate).not.toBeNull()
    expect(result.approval_rate).toBeGreaterThan(0)
  })

  it('returns zeros for a topic with no data points', async () => {
    const emptyTopicId = await insertTestTopic({
      name: `Empty Insights Tool Topic ${suffix}`,
      slug: `empty-insights-tool-topic-${suffix}`,
      createdById: user.id,
    })

    const execute = getTopicInsightsTool.function(user)
    const result = await execute({ topic_id: emptyTopicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.topic_id).toBe(emptyTopicId)
    expect(result.total_count).toBe(0)
    expect(result.approved_count).toBe(0)
    expect(result.approval_rate).toBeNull()
    expect(result.median_credit_limits).toEqual([])
    expect(result.credit_score_distribution).toEqual({})
  })

  it('returns median credit limits grouped by currency', async () => {
    const execute = getTopicInsightsTool.function(user)
    const result = await execute({ topic_id: topicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.median_credit_limits).toContainEqual({
      amount: 1_000_000,
      currency: 'usd',
    })
  })

  it('returns credit_score_distribution', async () => {
    const execute = getTopicInsightsTool.function(user)
    const result = await execute({ topic_id: topicId })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.credit_score_distribution).toBeTypeOf('object')
    expect(Object.keys(result.credit_score_distribution).length).toBeGreaterThanOrEqual(1)
  })

  it('accepts a topic slug and returns the resolved id', async () => {
    const execute = getTopicInsightsTool.function(user)
    const result = await execute({ topic_id: `insights-tool-topic-${suffix}` })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.topic_id).toBe(topicId)
    expect(result.total_count).toBeGreaterThanOrEqual(2)
  })

  it('reports an unknown topic', async () => {
    const execute = getTopicInsightsTool.function(user)
    const result = await execute({ topic_id: `missing-topic-${suffix}` })

    expect(result).toEqual({ success: false, error: 'Topic not found' })
  })
})
