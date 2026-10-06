import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { checkRouteRateLimit, routeRateLimiters } from './check.mts'
import { routeRateLimitConfig } from './config.mts'
import type { RateLimitIdentities } from './types.mts'

const CLAIMANT_NOTICE_ROUTES = [
  'POST:/api/v1/copyright-notices',
  'POST:/api/v1/copyright-eu-notices',
] as const
const SIBLING_SENSITIVE_ROUTES = [
  'POST:/api/v1/copyright-uk-notices',
  'POST:/api/v1/copyright-eu-notices/:id/statements-of-reasons',
  'POST:/api/v1/copyright-eu-notices/:id/redress-requests',
] as const

/** A Valkey outage as the limiter sees it; tagged so the error reporter stays quiet. */
function valkeyOutage(): Error {
  return Object.assign(new Error('Valkey unavailable'), { tags: { suppressLogging: true } })
}

describe('route rate limit failure mode', () => {
  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    // Keep local overrides from being replaced by cross-fork DynamicConfig pub/sub messages.
    routeRateLimitConfig.unsubscribe()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  function identities(): RateLimitIdentities {
    return { ip: `192.0.2.${randomUUID()}` }
  }

  it.each(CLAIMANT_NOTICE_ROUTES)(
    'fails closed for the %s claimant submission when Valkey errors',
    async route => {
      vi.spyOn(routeRateLimiters.sensitive, 'addAndCheck').mockRejectedValue(valkeyOutage())

      const result = await checkRouteRateLimit(route, identities(), null)

      expect(result).toMatchObject({ limited: true, retryAfterSeconds: 3600, remaining: 0 })
      expect(result.limit).toBeGreaterThan(0)
    },
  )

  it.each(SIBLING_SENSITIVE_ROUTES)('still fails open for %s when Valkey errors', async route => {
    vi.spyOn(routeRateLimiters.sensitive, 'addAndCheck').mockRejectedValue(valkeyOutage())

    const result = await checkRouteRateLimit(route, identities(), null)

    expect(result).toMatchObject({ limited: false, retryAfterSeconds: 0 })
    expect(result.remaining).toBe(result.limit)
  })

  it.each(CLAIMANT_NOTICE_ROUTES)(
    'does not limit the %s claimant submission while Valkey is healthy',
    async route => {
      const result = await checkRouteRateLimit(route, identities(), null)

      expect(result.limited).toBe(false)
      expect(result.remaining).toBeGreaterThan(0)
    },
  )
})
