import { randomUUID } from 'node:crypto'
import { afterEach, describe, it, expect } from 'vitest'
import { routeRateLimiters } from './check.mts'
import { buildRateLimitKeys } from './identity.mts'
import { createRouteRateLimitKeyCleanup, deleteRouteRateLimitKeys } from './test-support.mts'
import type { RateLimitIdentities } from './types.mts'

describe('deleteRouteRateLimitKeys', () => {
  it("deletes only the targeted identity's keys, leaving a sibling identity's counter untouched", async () => {
    // Purchase-intent creation is registered as `sensitive` in ROUTE_REGISTRY (see
    // check.test.mts, which exercises the same route as its own sensitive-category example).
    const routeKey = 'POST:/api/v1/membership-purchase-intents'
    const identityA: RateLimitIdentities = { ip: `2001:db8:a::${randomUUID()}` }
    const identityB: RateLimitIdentities = { ip: `2001:db8:b::${randomUUID()}` }

    const limiter = routeRateLimiters.sensitive
    const idsA = buildRateLimitKeys(routeKey, identityA)
    const idsB = buildRateLimitKeys(routeKey, identityB)

    await limiter.addAndCheck(idsA, 100)
    await limiter.addAndCheck(idsB, 100)
    await limiter.addAndCheck(idsB, 100)

    expect(await limiter.get(idsA)).toEqual([1])
    expect(await limiter.get(idsB)).toEqual([2])

    // Deliberately never call RateLimiter#invalidate() here: its prefix-wide SCAN+UNLINK would
    // wipe every concurrently running fork's `sensitive` counters, not just this test's identity
    // A. That contrast is the entire point of this regression — prove the scoped delete below is
    // surgical, unlike the blanket wipe it replaces across the changed test suites.
    await deleteRouteRateLimitKeys(routeKey, identityA)

    expect(await limiter.get(idsA)).toEqual([0])
    expect(await limiter.get(idsB)).toEqual([2])
  })

  it('is a no-op when the identities resolve to no keys', async () => {
    // An empty identities object (e.g. a route with no matching request context) builds zero
    // Valkey keys — deleteRouteRateLimitKeys must not call delete() with no arguments, which
    // would be a no-op-but-still-a-round-trip at best and a footgun for future limiter APIs.
    await expect(
      deleteRouteRateLimitKeys('POST:/api/v1/membership-purchase-intents', {}),
    ).resolves.toBeUndefined()
  })

  it('cleans the owned identity after a simulated assertion failure and caller mutation', async () => {
    const routeKey = 'POST:/api/v1/membership-purchase-intents'
    const identities: RateLimitIdentities = { ip: `2001:db8:c::${randomUUID()}` }
    const ownedIds = buildRateLimitKeys(routeKey, identities)
    const cleanup = createRouteRateLimitKeyCleanup()
    const limiter = routeRateLimiters.sensitive

    await cleanup.resetAndOwn(routeKey, identities)
    await limiter.addAndCheck(ownedIds, 100)
    identities.ip = `2001:db8:d::${randomUUID()}`

    let assertionError: unknown
    try {
      throw new Error('simulated assertion failure')
    } catch (error) {
      assertionError = error
    } finally {
      await cleanup.cleanup()
    }

    expect(assertionError).toEqual(new Error('simulated assertion failure'))
    expect(await limiter.get(ownedIds)).toEqual([0])
  })

  it('retains a failed owned scope so a final cleanup can retry it', async () => {
    const identities: RateLimitIdentities = { ip: `2001:db8:f::${randomUUID()}` }
    let deletionAttempts = 0
    const cleanup = createRouteRateLimitKeyCleanup(async () => {
      deletionAttempts += 1
      if (deletionAttempts === 2) throw new Error('transient exact-key deletion failure')
    })

    await cleanup.resetAndOwn('POST:/api/v1/membership-purchase-intents', identities)
    await expect(cleanup.cleanup()).rejects.toThrow(
      'Failed to clean up owned route rate-limit keys',
    )
    await expect(cleanup.cleanup()).resolves.toBeUndefined()
    expect(deletionAttempts).toBe(3)
  })

  describe('guaranteed teardown', () => {
    const routeKey = 'POST:/api/v1/membership-purchase-intents'
    const identities: RateLimitIdentities = { ip: `2001:db8:e::${randomUUID()}` }
    const ownedIds = buildRateLimitKeys(routeKey, identities)
    const cleanup = createRouteRateLimitKeyCleanup()
    const limiter = routeRateLimiters.sensitive

    afterEach(async () => {
      await cleanup.cleanup()
      const remaining = await limiter.get(ownedIds)
      if (remaining.some(count => count !== 0)) {
        throw new Error(`afterEach left owned route rate-limit counters: ${remaining.join(', ')}`)
      }
    })

    it('registers ownership before a guarded callback rejects', async () => {
      await cleanup.resetAndOwn(routeKey, identities)
      await limiter.addAndCheck(ownedIds, 100)

      await expect(
        Promise.reject(new Error('simulated assertion failure after the rate-limit write')),
      ).rejects.toThrow('simulated assertion failure after the rate-limit write')
      expect(await limiter.get(ownedIds)).toEqual([1])
    })
  })
})
