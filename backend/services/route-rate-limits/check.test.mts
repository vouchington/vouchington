import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { checkRouteRateLimit } from './check.mts'
import { routeRateLimitConfig, getAttestedMultiplier } from './config.mts'
import { createRouteRateLimitKeyCleanup } from './test-support.mts'
import { rateLimitConfig } from '@services/user-rate-limits/config'
import type { RateLimitIdentities } from './types.mts'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'

describe('check', () => {
  let testUser: PrivateUser
  const rateLimitKeyCleanup = createRouteRateLimitKeyCleanup()

  beforeAll(async () => {
    testUser = await createTestUser()
    await routeRateLimitConfig.waitForInitialization()
    await rateLimitConfig.waitForInitialization()
    // Unsubscribe from pub/sub to prevent cross-fork DynamicConfig messages
    // from overriding local setFields() calls between the config write and
    // the subsequent checkRouteRateLimit() read. close() is deferred to afterAll
    // so the singleton remains usable by other test files in the same fork.
    routeRateLimitConfig.unsubscribe()
    rateLimitConfig.unsubscribe()
  }, 30_000)

  afterEach(async () => {
    const errors: unknown[] = []
    try {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    } catch (error) {
      errors.push(error)
    }
    try {
      await rateLimitKeyCleanup.cleanup()
    } catch (error) {
      errors.push(error)
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) {
      throw new AggregateError(errors, 'Failed to clean up owned route rate-limit state')
    }
  })

  afterAll(async () => {
    const errors: unknown[] = []
    try {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
    } catch (error) {
      errors.push(error)
    }
    const finalizers = await Promise.allSettled([
      rateLimitKeyCleanup.cleanup(),
      closeScopedDynamicConfigContext([routeRateLimitConfig, rateLimitConfig]),
    ])
    for (const finalizer of finalizers) {
      if (finalizer.status === 'rejected') errors.push(finalizer.reason)
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to finalize route rate-limit tests')
    }
  })

  // Every test below uses a fixed, hardcoded identity (unlike HTTP-layer route-rate-limit
  // suites, which mint a fresh createRequest() per call and never need cleanup). Reset only the
  // specific keys a test is about to write through rateLimitKeyCleanup.resetAndOwn(). It deletes
  // stale state before use, snapshots ownership, and the guaranteed afterEach drains every owned
  // scope even when an assertion throws. This avoids RateLimiter#invalidate(), whose prefix-wide
  // SCAN+UNLINK would also wipe every concurrent fork's counters. See ./test-support.mts.

  describe('checkRouteRateLimit', () => {
    it('allows one-second OAuth completion polling for a full minute', async () => {
      const routeKey = 'POST:/api/v1/auth/oauth/authorizations/:flowId/complete'
      const identities: RateLimitIdentities = { ip: `192.0.2.${randomUUID()}` }
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_read: 180,
        anon_read_ttl: 60,
        anon_sensitive: 5,
        anon_sensitive_ttl: 60,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      for (let poll = 0; poll < 60; poll += 1) {
        const result = await checkRouteRateLimit(routeKey, identities, null)
        expect(result).toMatchObject({ limited: false, limit: 180 })
      }
    })

    it('returns not limited when rate limiting is disabled', async () => {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })

      const identities: RateLimitIdentities = { ip: '127.0.0.1' }
      const result = await checkRouteRateLimit('POST:/api/v1/posts', identities, testUser)
      expect(result.limited).toBe(false)
      expect(result.limit).toBe(0)
    })

    it('returns not limited when under threshold (authenticated user)', async () => {
      const routeKey = 'POST:/api/v1/posts'
      const identities: RateLimitIdentities = { ip: '192.0.2.1', userId: testUser.id }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
      overrideDynamicConfigFieldsForTest(rateLimitConfig, {
        write_tier1: 100,
        write_ttl: 60,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      const result = await checkRouteRateLimit(routeKey, identities, testUser)
      expect(result.limited).toBe(false)
      expect(result.limit).toBeGreaterThan(0)
      expect(result.remaining).toBeGreaterThan(0)
    })

    it('returns not limited when under threshold (anonymous user)', async () => {
      const routeKey = 'POST:/api/v1/posts'
      const identities: RateLimitIdentities = { ip: '192.0.2.2' }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_write: 100,
        anon_write_ttl: 60,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      const result = await checkRouteRateLimit(routeKey, identities, null)
      expect(result.limited).toBe(false)
      expect(result.limit).toBe(100)
    })

    it('blocks anonymous user when threshold exceeded', async () => {
      const routeKey = 'POST:/api/v1/posts'
      const identities: RateLimitIdentities = { ip: '192.0.2.3' }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_write: 2,
        anon_write_ttl: 60,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      const result1 = await checkRouteRateLimit(routeKey, identities, null)
      expect(result1.limited).toBe(false)

      const result2 = await checkRouteRateLimit(routeKey, identities, null)
      expect(result2.limited).toBe(true)
      expect(result2.remaining).toBe(0)
    })

    it('applies route multiplier to threshold', async () => {
      const routeKey = 'PUT:/api/v1/entity-relations/:id/vote'
      const identities: RateLimitIdentities = { ip: '192.0.2.4' }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_write: 10,
        anon_write_ttl: 60,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      // Vote endpoint has multiplier: 0.5 → threshold = ceil(10 * 0.5) = 5
      const result = await checkRouteRateLimit(routeKey, identities, null)
      expect(result.limit).toBe(5) // ceil(10 * 0.5)
    })

    it('API key path uses only IP + apikey identity keys', async () => {
      const routeKey = 'POST:/api/v1/posts'
      const identities: RateLimitIdentities = {
        ip: '192.0.2.5',
        apiKeyId: 'testkey1',
        // No deviceId/sessionId/userId — API key path
      }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_write: 100,
        anon_write_ttl: 60,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      const result = await checkRouteRateLimit(routeKey, identities, null)
      expect(result.limited).toBe(false)
      expect(result.limit).toBe(100)
    })

    it('most restrictive dimension wins', async () => {
      const routeKey = 'POST:/api/v1/posts'
      // Two requests from different IPs but same device — device gets blocked on 2nd
      const deviceId = `device-most-restrictive-test-${randomUUID()}`
      const ids1: RateLimitIdentities = { ip: '192.0.2.10', deviceId }
      const ids2: RateLimitIdentities = { ip: '192.0.2.11', deviceId }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_write: 2,
        anon_write_ttl: 60,
      })
      await Promise.all([
        rateLimitKeyCleanup.resetAndOwn(routeKey, ids1),
        rateLimitKeyCleanup.resetAndOwn(routeKey, ids2),
      ])

      const result1 = await checkRouteRateLimit(routeKey, ids1, null)
      expect(result1.limited).toBe(false)

      // Second request from different IP but same device: device key at 2 → blocked
      const result2 = await checkRouteRateLimit(routeKey, ids2, null)
      expect(result2.limited).toBe(true)
    })

    it('GET route inferred as read category', async () => {
      const routeKey = 'GET:/api/v1/posts'
      const identities: RateLimitIdentities = { ip: '192.0.2.6' }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_read: 50,
        anon_read_ttl: 60,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      const result = await checkRouteRateLimit(routeKey, identities, null)
      expect(result.limit).toBe(50)
    })

    it('session refresh uses read category (called on every page load)', async () => {
      const routeKey = 'PATCH:/api/v1/session'
      const identities: RateLimitIdentities = { ip: '192.0.2.20' }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_read: 30,
        anon_write: 5,
        anon_read_ttl: 60,
        anon_write_ttl: 60,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      const result = await checkRouteRateLimit(routeKey, identities, null)
      // Session refresh is registered as 'read' (30) not the PATCH default of 'write' (5)
      expect(result.limit).toBe(30)
    })

    it('sensitive route uses sensitive category', async () => {
      // Purchase intent creation is registered as sensitive in ROUTE_REGISTRY.
      const routeKey = 'POST:/api/v1/membership-purchase-intents'
      const identities: RateLimitIdentities = { ip: '192.0.2.7' }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_sensitive: 3,
        anon_write: 100,
        anon_sensitive_ttl: 60,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      const result = await checkRouteRateLimit(routeKey, identities, null)
      expect(result.limit).toBe(3)
    })

    it('applies attested_multiplier to anon threshold', async () => {
      const routeKey = 'POST:/api/v1/posts'
      const identities: RateLimitIdentities = { ip: '192.0.2.30', deviceClass: 'attested' }

      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, {
        enabled: true,
        anon_write: 10,
        anon_write_ttl: 60,
        attested_multiplier: 4,
      })
      await rateLimitKeyCleanup.resetAndOwn(routeKey, identities)

      const result = await checkRouteRateLimit(routeKey, identities, null)
      expect(result.limit).toBe(40) // ceil(10 * 4)
    })
  }, 60_000)

  describe('getAttestedMultiplier', () => {
    afterEach(() => {
      deleteDynamicConfigFieldsForTest(routeRateLimitConfig, ['attested_multiplier'])
    })

    it('returns the configured multiplier', () => {
      overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { attested_multiplier: 5 })
      expect(getAttestedMultiplier()).toBe(5)
    })

    it('returns 1 when not configured', () => {
      expect(getAttestedMultiplier()).toBe(1)
    })
  })
})
