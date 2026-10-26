import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import { RateLimiter, rateLimiterValkeyClient } from '@data-stores/valkey-rate-limiter'
import { valkeyEvents } from 'valkyries'
import { USAGE_QUOTA_WINDOW_SECONDS } from '../services/route-rate-limits/usage-policy.mts'
import { routeRateLimitConfig } from '../services/route-rate-limits/index.mts'
import app from '../api/app.mts'
import { startLocalAnalyticsForTest } from './api-usage-analytics.mts'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from './dynamic-config.mts'

const usageKeyBuilder = new RateLimiter({
  prefix: 'usage-quota',
  ttlSeconds: USAGE_QUOTA_WINDOW_SECONDS,
})

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
 * Its getter reports this process's actual completed quota writes for the current case.
 */
export function useRestUsageMetering(analyticsPrefix: string) {
  let stopLocalAnalytics: () => Promise<void>
  let originalConfig: ReturnType<typeof routeRateLimitConfig.getFields>
  const observedKeys = new Set<string>()
  const observeAdd = ({ prefix, ids }: { prefix: string; ids: string[] }) => {
    if (prefix === 'usage-quota') for (const id of ids) observedKeys.add(usageKeyBuilder.getKey(id))
  }

  beforeAll(async () => {
    stopLocalAnalytics = await startLocalAnalyticsForTest(analyticsPrefix)
    await routeRateLimitConfig.waitForInitialization()
    // Keep local overrides from being replaced by cross-fork DynamicConfig pub/sub messages.
    routeRateLimitConfig.unsubscribe()
    originalConfig = routeRateLimitConfig.getFields()
    valkeyEvents.on('rate-limiter:add', observeAdd)
  })

  beforeEach(() => {
    observedKeys.clear()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
  })

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalConfig)
  })

  afterAll(async () => {
    valkeyEvents.off('rate-limiter:add', observeAdd)
    await stopLocalAnalytics()
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })
  return () => [...observedKeys]
}

/** Read only explicitly owned quota identities through the SDK's canonical key builder. */
export async function usageQuotaKeys(ids: readonly string[]): Promise<string[]> {
  const existing = await Promise.all(
    ids.map(async id => {
      const key = usageKeyBuilder.getKey(id)
      return (await rateLimiterValkeyClient.exists([key])) ? key : null
    }),
  )
  return existing.filter((key): key is string => key !== null)
}
