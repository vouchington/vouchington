import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { searchDataPoints } from './search.mts'
import type { PrivateUser } from '@services/users/types'

describe('searchDataPoints', () => {
  let user: PrivateUser
  let topicId: string
  let otherTopicId: string
  const suffix = crypto.randomUUID().slice(0, 8)

  beforeAll(async () => {
    user = await createTestUser()
    topicId = await insertTestTopic({
      name: `Search DP Topic ${suffix}`,
      slug: `search-dp-topic-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })
    otherTopicId = await insertTestTopic({
      name: `Other DP Topic ${suffix}`,
      slug: `other-dp-topic-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })

    // Create a variety of data points for filtering tests
    await insertTestDataPoint({
      title: `Approved CC 670-739 ${suffix}`,
      slug: `dp-approved-670-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'approved',
      creditScoreRange: '670-739',
      creditLimit: { amount: 1_000_000, currency: 'usd' },
    })
    await insertTestDataPoint({
      title: `Denied CC 580-669 ${suffix}`,
      slug: `dp-denied-580-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'denied',
      creditScoreRange: '580-669',
    })
    await insertTestDataPoint({
      title: `Pending CC 740-799 ${suffix}`,
      slug: `dp-pending-740-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'pending',
      creditScoreRange: '740-799',
    })
    await insertTestDataPoint({
      title: `Approved BA ${suffix}`,
      slug: `dp-approved-ba-${suffix}`,
      createdById: user.id,
      vertical: 'bank_account',
      topicId,
      result: 'approved',
    })
    await insertTestDataPoint({
      title: `Other Topic DP ${suffix}`,
      slug: `dp-other-topic-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId: otherTopicId,
      result: 'approved',
    })
  })

  it('returns data points filtered by topic_id', async () => {
    const results = await searchDataPoints({ topic_id: topicId })
    expect(results.length).toBeGreaterThanOrEqual(4)
    // Should not include other topic's data points
    const otherTopicResults = results.filter(r =>
      (r.structured_data as { topic_ids?: string[] })?.topic_ids?.includes(otherTopicId),
    )
    expect(otherTopicResults).toHaveLength(0)
  })

  it('returns data points filtered by vertical', async () => {
    const results = await searchDataPoints({ topic_id: topicId, vertical: 'bank_account' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.data_point_vertical === 'bank_account')).toBe(true)
  })

  it('returns data points filtered by result', async () => {
    const results = await searchDataPoints({ topic_id: topicId, result: 'approved' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.structured_data?.result === 'approved')).toBe(true)
  })

  it('returns data points filtered by credit_score_range', async () => {
    const results = await searchDataPoints({
      topic_id: topicId,
      credit_score_range: '670-739',
    })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.structured_data?.credit_score_range === '670-739')).toBe(true)
  })

  it('combines multiple filters', async () => {
    const results = await searchDataPoints({
      topic_id: topicId,
      vertical: 'credit_card',
      result: 'denied',
      credit_score_range: '580-669',
    })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every(r => r.data_point_vertical === 'credit_card')).toBe(true)
    expect(results.every(r => r.structured_data?.result === 'denied')).toBe(true)
  })

  it('returns empty array for non-existent topic', async () => {
    const results = await searchDataPoints({
      topic_id: '00000000-0000-7000-8000-000000000001',
    })
    expect(results).toEqual([])
  })

  it('respects limit and caps at max 25', async () => {
    const results = await searchDataPoints({ limit: 1 })
    expect(results.length).toBeLessThanOrEqual(1)

    const bigResults = await searchDataPoints({ limit: 999 })
    expect(bigResults.length).toBeLessThanOrEqual(25)
  })

  it('returns required fields on each result', async () => {
    const results = await searchDataPoints({ topic_id: topicId, limit: 1 })
    expect(results.length).toBeGreaterThanOrEqual(1)
    const r = results[0]
    expect(r).toHaveProperty('id')
    expect(r).toHaveProperty('title')
    expect(r).toHaveProperty('data_point_vertical')
    expect(r).toHaveProperty('structured_data')
  })
})
