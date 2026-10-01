import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest'
import { rateLimiterValkeyClient } from '@data-stores/valkey-rate-limiter'
import { routeRateLimitConfig } from '../services/route-rate-limits/index.mts'
import app from '../api/app.mts'
import {
  readAnonymousApiUsageRows,
  readApiUsageRows,
  startLocalAnalyticsForTest,
} from './api-usage-analytics.mts'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from './dynamic-config.mts'

/**
 * Registers the REST routes the usage-metering suites call, under their own `base` so two suites
 * sharing one app never collide. Each applies the shared REST boundary exactly as a real route
 * does (`ok`, `loaded`, `twice`, `missing`, `boom`, `ip-only` are reads; `write` is a POST that
 * answers 202) and then ends one way.
 */
export function registerRestUsageRoutes(base: string) {
  app.route(`${base}/ok`).get(async ctx => {
    await ctx.applyRouteRateLimit(`GET:${base}/ok`)
    ctx.json({ ok: true })
  })
  app.route(`${base}/loaded`).get(async ctx => {
    await ctx.getCurrentUser()
    await ctx.applyRouteRateLimit(`GET:${base}/loaded`)
    ctx.json({ ok: true })
  })
  app.route(`${base}/twice`).get(async ctx => {
    await ctx.applyRouteRateLimit(`GET:${base}/twice`)
    await ctx.applyRouteRateLimit(`GET:${base}/twice`)
    ctx.json({ ok: true })
  })
  app.route(`${base}/missing`).get(async ctx => {
    await ctx.applyRouteRateLimit(`GET:${base}/missing`)
    ctx.throw(404, 'not here')
  })
  app.route(`${base}/boom`).get(async ctx => {
    await ctx.applyRouteRateLimit(`GET:${base}/boom`)
    throw new Error('upstream failed')
  })
  app.route(`${base}/ip-only`).get(async ctx => {
    await ctx.applyRouteRateLimit(`GET:${base}/ip-only`, { identityMode: 'ip-only' })
    ctx.json({ ok: true })
  })
  app.route(`${base}/write`).post(async ctx => {
    await ctx.applyRouteRateLimit(`POST:${base}/write`)
    ctx.setStatus(202)
    ctx.json({ ok: true })
  })
}

/**
 * Hooks for a suite that needs route rate limiting on (it is off by default under test) and a
 * local analytics directory to read `api_usage` rows back from. Call it inside a `describe`.
 */
export function useRestUsageMetering(analyticsPrefix: string) {
  let stopLocalAnalytics: () => Promise<void>
  let originalConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeAll(async () => {
    stopLocalAnalytics = await startLocalAnalyticsForTest(analyticsPrefix)
    await routeRateLimitConfig.waitForInitialization()
    // Keep local overrides from being replaced by cross-fork DynamicConfig pub/sub messages.
    routeRateLimitConfig.unsubscribe()
    originalConfig = routeRateLimitConfig.getFields()
  })

  beforeEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalConfig)
  })

  afterAll(async () => {
    await stopLocalAnalytics()
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })
}

// The usage event is emitted when the response closes, so it lands just after the response does.
export function waitForUsageRows(userId: string, count: number) {
  return vi.waitFor(
    async () => {
      const rows = await readApiUsageRows(userId)
      expect(rows).toHaveLength(count)
      return rows
    },
    { timeout: 15_000, interval: 100 },
  )
}

export function waitForAnonymousUsageRows(count: number) {
  return vi.waitFor(
    async () => {
      const rows = await readAnonymousApiUsageRows()
      expect(rows).toHaveLength(count)
      return rows
    },
    { timeout: 15_000, interval: 100 },
  )
}

/** Every Valkey key the usage quota holds, across all callers. */
export async function usageQuotaKeys(): Promise<string[]> {
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, page] = await rateLimiterValkeyClient.scan(cursor, {
      match: 'rate-limiter:usage-quota:*',
      count: 1000,
    })
    cursor = String(next)
    keys.push(...page.map(String))
  } while (cursor !== '0')
  return keys
}
