import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestDataPoint } from '@voucha/test-helpers/entities/data-points'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { getTopicDataPointInsights } from './insights.mts'
import type { PrivateUser } from '@services/users/types'
import { MAX_MONEY_AMOUNT } from '@ts-shared/money'

describe('getTopicDataPointInsights', () => {
  let user: PrivateUser
  let topicId: string
  const suffix = crypto.randomUUID().slice(0, 8)

  beforeAll(async () => {
    user = await createTestUser()
    topicId = await insertTestTopic({
      name: `Insights Topic ${suffix}`,
      slug: `insights-topic-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })

    // 3 approved, 2 denied, 1 pending
    await insertTestDataPoint({
      title: `Insights Approved 1 ${suffix}`,
      slug: `ins-approved-1-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'approved',
      creditScoreRange: '670-739',
      creditLimit: { amount: 500_000, currency: 'usd' },
    })
    await insertTestDataPoint({
      title: `Insights Approved 2 ${suffix}`,
      slug: `ins-approved-2-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'approved',
      creditScoreRange: '740-799',
      creditLimit: { amount: 1_000_000, currency: 'usd' },
    })
    await insertTestDataPoint({
      title: `Insights Approved 3 ${suffix}`,
      slug: `ins-approved-3-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'approved',
      creditScoreRange: '670-739',
      creditLimit: { amount: 1_500_000, currency: 'usd' },
    })
    await insertTestDataPoint({
      title: `Insights Denied 1 ${suffix}`,
      slug: `ins-denied-1-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'denied',
      creditScoreRange: '580-669',
    })
    await insertTestDataPoint({
      title: `Insights Denied 2 ${suffix}`,
      slug: `ins-denied-2-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'denied',
      creditScoreRange: '580-669',
    })
    await insertTestDataPoint({
      title: `Insights Pending 1 ${suffix}`,
      slug: `ins-pending-1-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId,
      result: 'pending',
      creditScoreRange: '800-850',
    })
  })

  it('returns zeros for a topic with no data points', async () => {
    const emptyTopicId = await insertTestTopic({
      name: `Empty Insights Topic ${suffix}`,
      slug: `empty-insights-topic-${suffix}`,
      createdById: user.id,
    })
    const insights = await getTopicDataPointInsights(emptyTopicId)

    expect(insights.total_count).toBe(0)
    expect(insights.approved_count).toBe(0)
    expect(insights.denied_count).toBe(0)
    expect(insights.pending_count).toBe(0)
    expect(insights.approval_rate).toBeNull()
    expect(insights.median_credit_limits).toEqual([])
    expect(insights.credit_score_distribution).toEqual({})
  })

  it('returns correct total, approved, denied, pending counts', async () => {
    const insights = await getTopicDataPointInsights(topicId)

    expect(insights.total_count).toBeGreaterThanOrEqual(6)
    expect(insights.approved_count).toBeGreaterThanOrEqual(3)
    expect(insights.denied_count).toBeGreaterThanOrEqual(2)
    expect(insights.pending_count).toBeGreaterThanOrEqual(1)
  })

  it('returns correct approval_rate', async () => {
    const insights = await getTopicDataPointInsights(topicId)

    expect(insights.approval_rate).not.toBeNull()
    expect(insights.approval_rate).toBeGreaterThan(0)
    expect(insights.approval_rate).toBeLessThanOrEqual(1)
    // 3 out of 6 = 0.5
    expect(insights.approved_count / insights.total_count).toBeCloseTo(insights.approval_rate!, 5)
  })

  it('returns median credit limits grouped by currency', async () => {
    const insights = await getTopicDataPointInsights(topicId)

    expect(insights.median_credit_limits).toContainEqual({
      amount: 1_000_000,
      currency: 'usd',
    })
  })

  it('uses the lower observed value for an even-sample discrete median', async () => {
    const evenTopicId = await insertTestTopic({
      name: `Even Median Insights Topic ${suffix}`,
      slug: `even-median-insights-topic-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })
    await Promise.all(
      [100, 200].map(async amount => {
        await insertTestDataPoint({
          title: `Even Median ${amount} ${suffix}`,
          slug: `even-median-${amount}-${suffix}`,
          createdById: user.id,
          vertical: 'credit_card',
          topicId: evenTopicId,
          result: 'approved',
          creditLimit: { amount, currency: 'usd' },
        })
      }),
    )

    const insights = await getTopicDataPointInsights(evenTopicId)
    expect(insights.median_credit_limits).toEqual([{ amount: 100, currency: 'usd' }])
  })

  it('preserves the maximum JSON-safe Money amount in a median', async () => {
    const maximumTopicId = await insertTestTopic({
      name: `Maximum Median Insights Topic ${suffix}`,
      slug: `maximum-median-insights-topic-${suffix}`,
      createdById: user.id,
      topicType: 'card',
    })
    await insertTestDataPoint({
      title: `Maximum Median ${suffix}`,
      slug: `maximum-median-${suffix}`,
      createdById: user.id,
      vertical: 'credit_card',
      topicId: maximumTopicId,
      result: 'approved',
      creditLimit: { amount: MAX_MONEY_AMOUNT, currency: 'usd' },
    })

    const insights = await getTopicDataPointInsights(maximumTopicId)
    expect(insights.median_credit_limits).toEqual([{ amount: MAX_MONEY_AMOUNT, currency: 'usd' }])
  })

  it('returns credit_score_distribution with correct counts', async () => {
    const insights = await getTopicDataPointInsights(topicId)

    expect(insights.credit_score_distribution).toBeTypeOf('object')
    // '670-739' appears twice (approved 1 and 3)
    expect(insights.credit_score_distribution['670-739']).toBeGreaterThanOrEqual(2)
    // '580-669' appears twice (denied 1 and 2)
    expect(insights.credit_score_distribution['580-669']).toBeGreaterThanOrEqual(2)
  })

  it('filters by vertical when provided', async () => {
    // Add a bank_account data point to the same topic
    await insertTestDataPoint({
      title: `Insights BA ${suffix}`,
      slug: `ins-ba-${suffix}`,
      createdById: user.id,
      vertical: 'bank_account',
      topicId,
      result: 'approved',
    })

    const ccInsights = await getTopicDataPointInsights(topicId, { vertical: 'credit_card' })
    const baInsights = await getTopicDataPointInsights(topicId, { vertical: 'bank_account' })

    // CC insights should not include bank_account entry
    expect(baInsights.total_count).toBeGreaterThanOrEqual(1)
    // Bank account count should be less than total
    expect(baInsights.total_count).toBeLessThan(ccInsights.total_count)
  })
})
