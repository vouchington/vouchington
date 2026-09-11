import { describe, it, expect, vi } from 'vitest'
import {
  createTestUser,
  hardDeleteTestPost,
  insertPostElectionVote,
  insertTestPost,
} from '@voucha/test-helpers'
import { getMaxUUIDv7ForDate, getMinUUIDv7ForDate } from '@modules/utils'
import {
  clearGrowthMetricsCacheForTesting,
  getGrowthMetrics,
  getRangeStart,
} from './get-growth-metrics.mts'
import { getUserGrowth } from './get-user-growth.mts'
import { getContentProduction } from './get-content-production.mts'
import { getEngagement } from './get-engagement.mts'
import { getNetworkEffects } from './get-network-effects.mts'
import { getRevenue } from './get-revenue.mts'
import { getInfrastructureMetrics } from './get-infrastructure-metrics.mts'
import type { GrowthRange } from './types.mts'

describe('getRangeStart', () => {
  it('returns start of today for "today"', () => {
    const now = new Date('2024-06-15T14:30:00Z')
    const start = getRangeStart('today', now)
    expect(start.getUTCHours()).toBe(0)
    expect(start.getUTCMinutes()).toBe(0)
    expect(start.getUTCSeconds()).toBe(0)
  })

  it('returns 7 days ago for "7d"', () => {
    const now = new Date('2024-06-15T14:30:00Z')
    const start = getRangeStart('7d', now)
    const diffDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(7, 0)
  })

  it('returns 30 days ago for "30d"', () => {
    const now = new Date('2024-06-15T14:30:00Z')
    const start = getRangeStart('30d', now)
    const diffDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(30, 0)
  })

  it('returns 90 days ago for "90d"', () => {
    const now = new Date('2024-06-15T14:30:00Z')
    const start = getRangeStart('90d', now)
    const diffDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeCloseTo(90, 0)
  })

  it('returns epoch for "all"', () => {
    const now = new Date()
    const start = getRangeStart('all', now)
    expect(start.getTime()).toBe(0)
  })
})

describe('getUserGrowth', () => {
  it('returns expected shape with non-negative numbers', async () => {
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - 30)
    const result = await getUserGrowth('30d', periodStart)

    expect(typeof result.total_users).toBe('number')
    expect(typeof result.new_users).toBe('number')
    expect(typeof result.dau).toBe('number')
    expect(typeof result.mau).toBe('number')
    expect(typeof result.dau_mau_ratio).toBe('number')
    expect(Array.isArray(result.signups_over_time)).toBe(true)

    expect(result.total_users).toBeGreaterThanOrEqual(0)
    expect(result.new_users).toBeGreaterThanOrEqual(0)
    expect(result.dau).toBeGreaterThanOrEqual(0)
    expect(result.mau).toBeGreaterThanOrEqual(0)
    expect(result.dau_mau_ratio).toBeGreaterThanOrEqual(0)
    expect(result.dau_mau_ratio).toBeLessThanOrEqual(1)
  })
})

describe('getContentProduction', () => {
  it('returns expected shape with non-negative numbers', async () => {
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - 30)
    const result = await getContentProduction('30d', periodStart)

    expect(typeof result.total_posts).toBe('number')
    expect(typeof result.contributions_per_active_user).toBe('number')
    expect(typeof result.clearance_approval_rate).toBe('number')
    expect(Array.isArray(result.content_over_time)).toBe(true)

    expect(result.total_posts).toBeGreaterThanOrEqual(0)
    expect(result.clearance_approval_rate).toBeGreaterThanOrEqual(0)
    expect(result.clearance_approval_rate).toBeLessThanOrEqual(1)

    const { posts_by_type } = result
    expect(typeof posts_by_type.review).toBe('number')
    expect(typeof posts_by_type.data_point).toBe('number')
    expect(typeof posts_by_type.discussion).toBe('number')
    expect(typeof posts_by_type.comment).toBe('number')
    expect(typeof posts_by_type.story).toBe('number')
  })
})

describe('getEngagement', () => {
  it('excludes repaired legacy sentiment events while counting semantic votes', async () => {
    const periodStart = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1_000)
    const voteTime = new Date(periodStart.getTime() + 1_000)
    const user = await createTestUser()
    const suffix = crypto.randomUUID()
    const [repairedPostId, semanticPostId] = await Promise.all([
      insertTestPost({
        title: `Repaired vote ${suffix}`,
        slug: `repaired-vote-${suffix}`,
        markdown: 'Repaired vote engagement fixture.',
        createdById: user.id,
      }),
      insertTestPost({
        title: `Semantic vote ${suffix}`,
        slug: `semantic-vote-${suffix}`,
        markdown: 'Semantic vote engagement fixture.',
        createdById: user.id,
      }),
    ])
    try {
      const before = await getEngagement('all', periodStart)

      await Promise.all([
        insertPostElectionVote(user.id, repairedPostId, 2, getMinUUIDv7ForDate(voteTime)),
        insertPostElectionVote(
          user.id,
          semanticPostId,
          2,
          getMaxUUIDv7ForDate(voteTime),
          false,
          true,
        ),
      ])

      const result = await getEngagement('all', periodStart)

      expect(result.votes_cast).toBe(before.votes_cast + 1)
    } finally {
      await Promise.all([hardDeleteTestPost(repairedPostId), hardDeleteTestPost(semanticPostId)])
    }
  })

  it('returns expected shape with non-negative numbers', async () => {
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - 30)
    const result = await getEngagement('30d', periodStart)

    expect(typeof result.votes_cast).toBe('number')
    expect(typeof result.comments_created).toBe('number')
    expect(typeof result.follows_created).toBe('number')
    expect(typeof result.avg_follows_per_user).toBe('number')
    expect(Array.isArray(result.votes_over_time)).toBe(true)
    expect(Array.isArray(result.comments_over_time)).toBe(true)
    expect(Array.isArray(result.follows_over_time)).toBe(true)

    expect(result.votes_cast).toBeGreaterThanOrEqual(0)
    expect(result.comments_created).toBeGreaterThanOrEqual(0)
    expect(result.follows_created).toBeGreaterThanOrEqual(0)
    expect(result.avg_follows_per_user).toBeGreaterThanOrEqual(0)
  })
})

describe('getNetworkEffects', () => {
  it('returns expected shape with non-negative numbers', async () => {
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - 30)
    const result = await getNetworkEffects('30d', periodStart)

    expect(typeof result.referral_coefficient).toBe('number')
    expect(typeof result.topic_coverage_rate).toBe('number')
    expect(typeof result.landing_page_visits).toBe('number')
    expect(typeof result.new_signups).toBe('number')
    expect(typeof result.signup_visit_ratio).toBe('number')

    expect(result.referral_coefficient).toBeGreaterThanOrEqual(0)
    expect(result.topic_coverage_rate).toBeGreaterThanOrEqual(0)
    expect(result.topic_coverage_rate).toBeLessThanOrEqual(1)
    expect(result.landing_page_visits).toBeGreaterThanOrEqual(0)
    expect(result.new_signups).toBeGreaterThanOrEqual(0)
  })
})

describe('getRevenue', () => {
  it('returns expected shape with non-negative numbers', async () => {
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - 30)
    const result = await getRevenue('30d', periodStart)

    expect(typeof result.active_memberships).toBe('number')
    expect(Array.isArray(result.mrr_by_currency)).toBe(true)
    expect(typeof result.upgrades).toBe('number')
    expect(typeof result.downgrades).toBe('number')
    expect(typeof result.cancellations).toBe('number')
    expect(typeof result.churn_rate).toBe('number')
    expect(typeof result.memberships_by_tier).toBe('object')

    expect(result.active_memberships).toBeGreaterThanOrEqual(0)
    for (const mrr of result.mrr_by_currency) {
      expect(mrr).toEqual({
        amount: expect.stringMatching(/^(0|[1-9]\d*)$/),
        currency: expect.any(String),
        scale: 6,
      })
    }
    expect(result.churn_rate).toBeGreaterThanOrEqual(0)
    expect(result.churn_rate).toBeLessThanOrEqual(1)
  })
})

describe('getInfrastructureMetrics', () => {
  it('returns expected shape (null or number for each metric)', async () => {
    const periodStart = new Date()
    periodStart.setDate(periodStart.getDate() - 30)

    // Explicitly stub the backend to 'disabled' for this test. query() in
    // backend/data-stores/analytics/query.mts re-reads process.env.ANALYTICS_BACKEND on every
    // call and short-circuits to [] only when it is not 'local' — without this stub, a
    // suite/CI run with ANALYTICS_BACKEND=local would query the real analytics tables instead
    // and this test's null-rate assertions would depend on the ambient environment.
    vi.stubEnv('ANALYTICS_BACKEND', 'disabled')
    try {
      const result = await getInfrastructureMetrics('30d', periodStart)

      const isNullOrNumber = (v: unknown) => v === null || typeof v === 'number'
      expect(isNullOrNumber(result.crawler_success_rate)).toBe(true)
      expect(isNullOrNumber(result.queue_throughput)).toBe(true)
      expect(isNullOrNumber(result.cache_hit_rate)).toBe(true)
      expect(isNullOrNumber(result.ai_token_usage)).toBe(true)

      // With the backend forced to 'disabled', query() is a structural no-op returning [],
      // which forces both rates to the "no data" -> null branch deterministically. When a row
      // is actually present, the ratio bound is guaranteed by construction (success/hit counts
      // are non-negative and never exceed total).
      expect(result.crawler_success_rate).toBeNull()
      expect(result.cache_hit_rate).toBeNull()
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('getGrowthMetrics', () => {
  it('evicts rejected loads so a later call can retry', async () => {
    clearGrowthMetricsCacheForTesting()
    const invalidRange = 'invalid' as GrowthRange
    const first = getGrowthMetrics(invalidRange)

    await expect(first).rejects.toThrow(/.+/)

    const retry = getGrowthMetrics(invalidRange)
    expect(retry).not.toBe(first)
    await expect(retry).rejects.toThrow(/.+/)
  })

  it('coalesces repeated loads for the same range behind the short cache', async () => {
    clearGrowthMetricsCacheForTesting()
    const first = getGrowthMetrics('7d')
    const second = getGrowthMetrics('7d')

    expect(second).toBe(first)
    await expect(first).resolves.toBe(await second)
  })

  it('returns complete metrics with all 6 categories', async () => {
    const metrics = await getGrowthMetrics('30d')

    expect(metrics.range).toBe('30d')
    expect(typeof metrics.period_start).toBe('string')
    expect(typeof metrics.period_end).toBe('string')
    expect(metrics).toHaveProperty('user_growth')
    expect(metrics).toHaveProperty('content_production')
    expect(metrics).toHaveProperty('engagement')
    expect(metrics).toHaveProperty('network_effects')
    expect(metrics).toHaveProperty('revenue')
    expect(metrics).toHaveProperty('infrastructure')
  })

  it('returns correct range for each valid range value', async () => {
    const ranges = ['today', '7d', '30d', '90d', 'all'] as const
    for (const range of ranges) {
      const metrics = await getGrowthMetrics(range)
      expect(metrics.range).toBe(range)
    }
  })
})
