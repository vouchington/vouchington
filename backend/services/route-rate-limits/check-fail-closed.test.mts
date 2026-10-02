import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { checkRouteRateLimit, routeRateLimiters } from './check.mts'
import { routeRateLimitConfig } from './config.mts'
import type { RateLimitIdentities } from './types.mts'

const CLAIMANT_NOTICE_ROUTE = 'POST:/api/v1/copyright-notices'
const SIBLING_SENSITIVE_ROUTE = 'POST:/api/v1/copyright-uk-notices'

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

  it('fails closed for the claimant copyright-notice submission when Valkey errors', async () => {
    vi.spyOn(routeRateLimiters.sensitive, 'addAndCheck').mockRejectedValue(valkeyOutage())

    const result = await checkRouteRateLimit(CLAIMANT_NOTICE_ROUTE, identities(), null)

    expect(result).toMatchObject({ limited: true, retryAfterSeconds: 3600, remaining: 0 })
    expect(result.limit).toBeGreaterThan(0)
  })

  it('still fails open for every other route when Valkey errors', async () => {
    vi.spyOn(routeRateLimiters.sensitive, 'addAndCheck').mockRejectedValue(valkeyOutage())

    const result = await checkRouteRateLimit(SIBLING_SENSITIVE_ROUTE, identities(), null)

    expect(result).toMatchObject({ limited: false, retryAfterSeconds: 0 })
    expect(result.remaining).toBe(result.limit)
  })

  it('does not limit the claimant submission while Valkey is healthy', async () => {
    const result = await checkRouteRateLimit(CLAIMANT_NOTICE_ROUTE, identities(), null)

    expect(result.limited).toBe(false)
    expect(result.remaining).toBeGreaterThan(0)
  })
})
