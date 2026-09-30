import { describe, expect, it } from 'vitest'
import { isCurrencyCode } from '@ts-shared/money'
import * as serverRoutes from '@/lib/api/server'
import { installRoutesExtendedHarness } from '../../test-helpers/routes-extended-harness.mts'

function unset(target: object, key: string) {
  delete (target as Record<string, unknown>)[key]
}

describe('routes-extended', () => {
  const harness = installRoutesExtendedHarness({
    unset,
    workerSecret: 'with-cookie',
  })

  describe('growth metrics server routes', () => {
    it('getGrowthMetrics returns valid shape for admin user', async () => {
      const metrics = await serverRoutes.getGrowthMetrics({
        range: '30d',
        headers: harness.adminCookieHeader,
      })
      expect(metrics).toMatchObject({
        range: '30d',
        period_start: expect.any(String),
        period_end: expect.any(String),
        user_growth: expect.objectContaining({
          total_users: expect.any(Number),
          new_users: expect.any(Number),
          dau: expect.any(Number),
          mau: expect.any(Number),
          dau_mau_ratio: expect.any(Number),
          signups_over_time: expect.any(Array),
        }),
        content_production: expect.objectContaining({
          total_posts: expect.any(Number),
          posts_by_type: expect.objectContaining({
            review: expect.any(Number),
            data_point: expect.any(Number),
            discussion: expect.any(Number),
            comment: expect.any(Number),
            story: expect.any(Number),
          }),
          contributions_per_active_user: expect.any(Number),
          clearance_approval_rate: expect.any(Number),
          content_over_time: expect.any(Array),
        }),
        engagement: expect.objectContaining({
          votes_cast: expect.any(Number),
          comments_created: expect.any(Number),
          follows_created: expect.any(Number),
          avg_follows_per_user: expect.any(Number),
        }),
        network_effects: expect.objectContaining({
          referral_coefficient: expect.any(Number),
          topic_coverage_rate: expect.any(Number),
          landing_page_visits: expect.any(Number),
          new_signups: expect.any(Number),
          signup_visit_ratio: expect.any(Number),
        }),
        revenue: expect.objectContaining({
          active_memberships: expect.any(Number),
          mrr_by_currency: expect.any(Array),
          upgrades: expect.any(Number),
          downgrades: expect.any(Number),
          cancellations: expect.any(Number),
          churn_rate: expect.any(Number),
        }),
        infrastructure: expect.any(Object),
      })
      const { infrastructure } = metrics
      expect(
        infrastructure.crawler_success_rate === null ||
          typeof infrastructure.crawler_success_rate === 'number',
      ).toBe(true)
      expect(
        infrastructure.queue_throughput === null ||
          typeof infrastructure.queue_throughput === 'number',
      ).toBe(true)
      expect(
        infrastructure.cache_hit_rate === null || typeof infrastructure.cache_hit_rate === 'number',
      ).toBe(true)
      expect(
        infrastructure.ai_token_usage === null || typeof infrastructure.ai_token_usage === 'number',
      ).toBe(true)
      for (const mrr of metrics.revenue.mrr_by_currency) {
        expect(mrr).toEqual({
          amount: expect.stringMatching(/^(0|[1-9]\d*)$/),
          currency: expect.any(String),
          scale: 6,
        })
        expect(BigInt(mrr.amount)).toBeGreaterThanOrEqual(0n)
        expect(isCurrencyCode(mrr.currency)).toBe(true)
      }
      expect(new Set(metrics.revenue.mrr_by_currency.map(mrr => mrr.currency)).size).toBe(
        metrics.revenue.mrr_by_currency.length,
      )
    })

    it('getGrowthMetrics returns valid shape for today range', async () => {
      // Bracket the request with the UTC midnight of "now" immediately before and after it
      // fires: the midnight-alignment-only check below would accept every non-epoch midnight
      // in history (an off-by-one-day, start-of-month, or stale-data regression included).
      // Comparing against a single `new Date()` snapshot instead would be flaky, since the
      // request can straddle the UTC-midnight boundary (or the 10s growth-metrics cache TTL)
      // between computing the expectation and the response resolving — bracketing before and
      // after preserves that tolerance while still proving the returned day is current.
      const utcMidnightMs = (date: Date) =>
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      const beforeMidnightMs = utcMidnightMs(new Date())
      const metrics = await serverRoutes.getGrowthMetrics({
        range: 'today',
        headers: harness.adminCookieHeader,
      })
      const afterMidnightMs = utcMidnightMs(new Date())
      expect(metrics.range).toBe('today')
      const periodStartMs = new Date(metrics.period_start).getTime()
      expect([beforeMidnightMs, afterMidnightMs]).toContain(periodStartMs)
      expect(metrics.user_growth).toMatchObject({
        total_users: expect.any(Number),
        new_users: expect.any(Number),
        dau: expect.any(Number),
        mau: expect.any(Number),
      })
    })
  })

  describe('topics compare server routes', () => {
    it('getTopicsCompare returns 200 for two valid slugs', async () => {
      const result = await serverRoutes.getTopicsCompare(
        harness.compareTopicA.slug,
        harness.compareTopicB.slug,
      )
      expect(result).not.toBeNull()
      expect(Object.keys(result!.topics)).toHaveLength(2)
    })

    it('getTopicsCompare returns null for missing topic', async () => {
      const result = await serverRoutes.getTopicsCompare(
        'missing-topic-abc123',
        harness.compareTopicA.slug,
      )
      expect(result).toBeNull()
    })
  })

  describe('memberships server routes', () => {
    it('getMembership returns membership data regardless of feature flag state', async () => {
      // Feature flags are frontend-only; APIs always respond. userCookieHeader's user has
      // no membership row, so the route must report that explicitly rather than omitting
      // the field, erroring, or echoing a non-null placeholder.
      const result = await serverRoutes.getMembership({ headers: harness.userCookieHeader })
      expect(result.membership).toBeNull()
    })
  })
})
