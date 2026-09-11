import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import http from 'node:http'
import serverApp from '../../../backend/entrypoints/api/index.mts'
import { isCurrencyCode } from '@ts-shared/money'
import * as clientRoutes from '@/lib/api/client'
import * as serverRoutes from '@/lib/api/server'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  createTestUserWithAge,
  insertTestCommunity,
  createReferralProgramFixture,
} from '../../../backend/test-helpers/index.mts'
import { createWebApiTestCookieHeader, listenOnFetchSafeLoopback } from '../routes.mts'
import type { CookieHeader } from '../routes-extended.mts'

describe('routes-extended', () => {
  let backendServer: http.Server

  let previousApiBaseUrl: string | undefined

  let previousPublicApiBaseUrl: string | undefined

  let previousFetch: typeof globalThis.fetch

  let hadWindow: boolean

  let previousWindow: unknown

  let backendBaseUrl: string

  let clientRuntimeActive = false

  let clientCookieValue: string | undefined

  let userCookieHeader: CookieHeader

  let adminCookieHeader: CookieHeader

  let topicSlugA: string

  let topicSlugB: string

  beforeAll(async () => {
    previousApiBaseUrl = process.env.API_BASE_URL
    previousPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL

    backendServer = http.createServer(serverApp.callback())
    backendBaseUrl = await listenOnFetchSafeLoopback(backendServer)
    process.env.API_BASE_URL = backendBaseUrl
    process.env.NEXT_PUBLIC_API_BASE_URL = backendBaseUrl

    previousFetch = globalThis.fetch
    hadWindow = Object.hasOwn(globalThis, 'window')
    previousWindow = (globalThis as { window?: unknown }).window
    globalThis.fetch = (input, init) => {
      if (!clientRuntimeActive || typeof input !== 'string' || !input.startsWith('/')) {
        return previousFetch(input, init)
      }

      const headers = new Headers(init?.headers)
      if (clientCookieValue) {
        headers.set('Cookie', clientCookieValue)
        if (process.env.CF_WORKER_SECRET) {
          headers.set('X-CF-Worker-Secret', process.env.CF_WORKER_SECRET)
        }
        if ((init?.method ?? 'GET').toUpperCase() !== 'GET') {
          headers.set('Origin', backendBaseUrl)
        }
      }

      return previousFetch(`${backendBaseUrl}${input}`, {
        ...init,
        headers,
      })
    }

    const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000
    const user = await createTestUserWithAge(EIGHT_DAYS_MS)
    const admin = await createTestUser({ administrator: true })
    userCookieHeader = await createWebApiTestCookieHeader(user.id)
    adminCookieHeader = await createWebApiTestCookieHeader(admin.id)

    await createTestTopic({ user: admin })

    const compareTopicsId = randomUUID()
    const compareTopicA = await createTestTopic({
      user: admin,
      slug: `ext-compare-a-${compareTopicsId}`,
      name: `Extended Compare Topic A ${compareTopicsId}`,
    })
    const compareTopicB = await createTestTopic({
      user: admin,
      slug: `ext-compare-b-${compareTopicsId}`,
      name: `Extended Compare Topic B ${compareTopicsId}`,
    })
    topicSlugA = compareTopicA.slug
    topicSlugB = compareTopicB.slug

    await createTestPost({ user })

    await insertTestCommunity({ createdById: admin.id })

    await createReferralProgramFixture({ createdById: admin.id })

    const topicRecommendationId = randomUUID()
    await withClientRuntime(
      () =>
        clientRoutes.createTopicRecommendation({
          markdown: 'A great topic recommendation for testing',
          topic_title: `Extended Test Topic ${topicRecommendationId}`,
          topic_slug: `ext-test-topic-rec-${topicRecommendationId}`,
        }),
      userCookieHeader,
    )
  }, 20_000)

  afterAll(async () => {
    await new Promise<void>(resolve => {
      backendServer.close(() => resolve())
    })
    if (previousApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL
    } else {
      process.env.API_BASE_URL = previousApiBaseUrl
    }

    if (previousPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = previousPublicApiBaseUrl
    }

    globalThis.fetch = previousFetch
    if (hadWindow) {
      ;(globalThis as { window?: unknown }).window = previousWindow
    } else {
      delete (globalThis as { window?: unknown }).window
    }
  }, 15_000)

  async function withClientRuntime<T>(
    run: () => Promise<T>,
    cookieHeader?: Record<string, string>,
  ): Promise<T> {
    clientRuntimeActive = true
    clientCookieValue = cookieHeader?.Cookie
    ;(globalThis as { window?: unknown }).window = {}

    try {
      return await run()
    } finally {
      clientRuntimeActive = false
      clientCookieValue = undefined

      if (hadWindow) {
        ;(globalThis as { window?: unknown }).window = previousWindow
      } else {
        delete (globalThis as { window?: unknown }).window
      }
    }
  }

  describe('growth metrics server routes', () => {
    it('getGrowthMetrics returns valid shape for admin user', async () => {
      const metrics = await serverRoutes.getGrowthMetrics({
        range: '30d',
        headers: adminCookieHeader,
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
        headers: adminCookieHeader,
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
      const result = await serverRoutes.getTopicsCompare(topicSlugA, topicSlugB)
      expect(result).not.toBeNull()
      expect(Object.keys(result!.topics)).toHaveLength(2)
    })

    it('getTopicsCompare returns null for missing topic', async () => {
      const result = await serverRoutes.getTopicsCompare('missing-topic-abc123', topicSlugA)
      expect(result).toBeNull()
    })
  })

  describe('memberships server routes', () => {
    it('getMembership returns membership data regardless of feature flag state', async () => {
      // Feature flags are frontend-only; APIs always respond. userCookieHeader's user has
      // no membership row, so the route must report that explicitly rather than omitting
      // the field, erroring, or echoing a non-null placeholder.
      const result = await serverRoutes.getMembership({ headers: userCookieHeader })
      expect(result.membership).toBeNull()
    })
  })
})
