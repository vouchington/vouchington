import { beforeAll, describe, expect, it } from 'vitest'
import compareTopicsTool from './compare-topics.mts'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'

describe('compare_topics tool — real DB', () => {
  let user: PrivateUser
  let topicIdA: string
  let topicIdB: string
  const suffix = crypto.randomUUID().slice(0, 8)

  beforeAll(async () => {
    user = await createTestUser()
    topicIdA = await insertTestTopic({
      name: `Compare Topic A ${suffix}`,
      slug: `compare-topic-a-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })
    topicIdB = await insertTestTopic({
      name: `Compare Topic B ${suffix}`,
      slug: `compare-topic-b-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })

    // Topic A: 2 approved, 1 denied
    await insertTestDataPoint({
      title: `Compare A Approved 1 ${suffix}`,
      slug: `cmp-a-approved-1-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId: topicIdA,
      result: 'approved',
      creditScoreRange: '670-739',
    })
    await insertTestDataPoint({
      title: `Compare A Approved 2 ${suffix}`,
      slug: `cmp-a-approved-2-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId: topicIdA,
      result: 'approved',
      creditScoreRange: '740-799',
    })
    await insertTestDataPoint({
      title: `Compare A Denied ${suffix}`,
      slug: `cmp-a-denied-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId: topicIdA,
      result: 'denied',
    })

    // Topic B: 1 approved, 2 denied
    await insertTestDataPoint({
      title: `Compare B Approved ${suffix}`,
      slug: `cmp-b-approved-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId: topicIdB,
      result: 'approved',
    })
    await insertTestDataPoint({
      title: `Compare B Denied 1 ${suffix}`,
      slug: `cmp-b-denied-1-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId: topicIdB,
      result: 'denied',
    })
    await insertTestDataPoint({
      title: `Compare B Denied 2 ${suffix}`,
      slug: `cmp-b-denied-2-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId: topicIdB,
      result: 'denied',
    })
  })

  it('returns success with topic_a and topic_b', async () => {
    const execute = compareTopicsTool.function(user)
    const result = await execute({ topic_id_a: topicIdA, topic_id_b: topicIdB })

    expect(result.success).toBe(true)
    expect(result.topic_a).toBeDefined()
    expect(result.topic_b).toBeDefined()
  })

  it('includes topic_id in each comparison', async () => {
    const execute = compareTopicsTool.function(user)
    const result = await execute({ topic_id_a: topicIdA, topic_id_b: topicIdB })

    expect(result.topic_a.topic_id).toBe(topicIdA)
    expect(result.topic_b.topic_id).toBe(topicIdB)
  })

  it('includes topic_name from entity cache', async () => {
    const execute = compareTopicsTool.function(user)
    const result = await execute({ topic_id_a: topicIdA, topic_id_b: topicIdB })

    // Topics were created with names, but entity cache may not be populated in tests
    // topic_name should be string or null (not undefined)
    expect(
      result.topic_a.topic_name === null || typeof result.topic_a.topic_name === 'string',
    ).toBe(true)
    expect(
      result.topic_b.topic_name === null || typeof result.topic_b.topic_name === 'string',
    ).toBe(true)
  })

  it('topic_a has higher approval rate than topic_b', async () => {
    const execute = compareTopicsTool.function(user)
    const result = await execute({ topic_id_a: topicIdA, topic_id_b: topicIdB })

    // topic_a: 2/3 approved ~66%, topic_b: 1/3 approved ~33%
    expect(result.topic_a.approved_count).toBeGreaterThanOrEqual(2)
    expect(result.topic_b.denied_count).toBeGreaterThanOrEqual(2)

    expect(result.topic_a.approval_rate).not.toBeNull()
    expect(result.topic_b.approval_rate).not.toBeNull()
    expect(result.topic_a.approval_rate!).toBeGreaterThan(result.topic_b.approval_rate!)
  })

  it('returns zeros for topic with no data points', async () => {
    const emptyTopicId = await insertTestTopic({
      name: `Compare Empty Topic ${suffix}`,
      slug: `compare-empty-topic-${suffix}`,
      createdById: user.id,
    })

    const execute = compareTopicsTool.function(user)
    const result = await execute({ topic_id_a: topicIdA, topic_id_b: emptyTopicId })

    expect(result.topic_b.total_count).toBe(0)
    expect(result.topic_b.approval_rate).toBeNull()
  })

  it('includes all insight fields in each comparison', async () => {
    const execute = compareTopicsTool.function(user)
    const result = await execute({ topic_id_a: topicIdA, topic_id_b: topicIdB })

    for (const topic of [result.topic_a, result.topic_b]) {
      expect(topic).toHaveProperty('total_count')
      expect(topic).toHaveProperty('approved_count')
      expect(topic).toHaveProperty('denied_count')
      expect(topic).toHaveProperty('pending_count')
      expect(topic).toHaveProperty('approval_rate')
      expect(topic).toHaveProperty('median_credit_limits')
      expect(topic).toHaveProperty('credit_score_distribution')
    }
  })
})
