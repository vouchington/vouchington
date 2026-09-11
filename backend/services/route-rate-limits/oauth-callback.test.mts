import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { checkRouteRateLimit } from './check.mts'
import { getRouteConfig, routeRateLimitConfig } from './config.mts'
import { createRouteRateLimitKeyCleanup } from './test-support.mts'

describe('OAuth provider callback rate limit', () => {
  const routeKey = 'GET:/api/v1/auth/oauth/:provider/broker-callback'
  const keyCleanup = createRouteRateLimitKeyCleanup()

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    await keyCleanup.cleanup()
  })

  afterAll(async () => {
    await Promise.all([
      keyCleanup.cleanup(),
      closeScopedDynamicConfigContext([routeRateLimitConfig]),
    ])
  })

  it('uses a dedicated NAT-safe quota instead of the anonymous sensitive quota', async () => {
    const identities = {
      ip: `oauth-callback-nat-${randomUUID()}`,
      userTrustTier: 5,
      deviceClass: 'attested',
    } as const
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_sensitive: 5,
      anon_oauth_callback: 300,
      anon_oauth_callback_ttl: 60,
    })
    await keyCleanup.resetAndOwn(routeKey, identities)

    expect(getRouteConfig(routeKey)).toEqual({ category: 'oauth_callback' })
    await expect(checkRouteRateLimit(routeKey, identities, null)).resolves.toMatchObject({
      limited: false,
      limit: 300,
      retryAfterSeconds: 60,
    })
  })

  it('enforces the callback-specific configured quota through the live limiter', async () => {
    const identities = { ip: `oauth-callback-config-${randomUUID()}` }
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
      enabled: true,
      anon_oauth_callback: 2,
      anon_oauth_callback_ttl: 90,
    })
    await keyCleanup.resetAndOwn(routeKey, identities)

    await expect(checkRouteRateLimit(routeKey, identities, null)).resolves.toMatchObject({
      limited: false,
      limit: 2,
      retryAfterSeconds: 90,
    })
    await expect(checkRouteRateLimit(routeKey, identities, null)).resolves.toMatchObject({
      limited: true,
      limit: 2,
      remaining: 0,
      retryAfterSeconds: 90,
    })
  })
})
