import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import {
  createRouteRateLimiter,
  type RouteRateLimitCheckOptions,
  type RouteRateLimitResult,
} from '@vouchington/rate-limit'
import type { PrivateUser } from '@services/users/types'
import { computeTrustTier } from '@services/user-rate-limits/trust-tier'
import { getUserRateLimitContext } from '@services/user-rate-limits/context'
import { getRateLimitThreshold, getRateLimitTtl } from '@services/user-rate-limits/config'
import {
  getRouteConfig,
  getAnonThreshold,
  getAnonTtl,
  getAttestedMultiplier,
  isRouteRateLimitEnabled,
} from './config.mts'
import type { RateLimitIdentities, RouteRateLimitCategory } from './types.mts'
import onError from '@modules/on-error'
import { getRateLimitKeyDimensions } from './identity.mts'

const routeRateLimiters: Record<RouteRateLimitCategory, RateLimiter> = {
  read: new RateLimiter({ prefix: 'route-rl-read', ttlSeconds: 60 }),
  write: new RateLimiter({ prefix: 'route-rl-write', ttlSeconds: 60 }),
  sensitive: new RateLimiter({ prefix: 'route-rl-sensitive', ttlSeconds: 60 }),
  oauth_callback: new RateLimiter({ prefix: 'route-rl-oauth-callback', ttlSeconds: 60 }),
}

/**
 * Check per-route rate limit for a request.
 *
 * Identity resolution:
 * - Authenticated user: trust tier thresholds × route multiplier
 * - Anonymous: DynamicConfig anon thresholds × route multiplier
 * - API key: IP + apikey keys, no user/session tracking
 *
 * Fails open on Valkey errors, except for routes whose registry entry sets `failClosed`.
 */
const checkPublishedRouteLimit = createRouteRateLimiter<{
  identities: RateLimitIdentities
  currentUser: PrivateUser | null
}>({
  hashedDimensions: new Set(['email']),
  getBackend(routeKey) {
    return routeRateLimiters[getRouteConfig(routeKey).category]
  },
  onError,
  async resolvePolicy(routeKey, _keyIdentities, { identities, currentUser }) {
    const routeEntry = getRouteConfig(routeKey)
    const { category } = routeEntry
    const multiplier = routeEntry.multiplier ?? 1

    let threshold: number
    let ttlSeconds: number

    if (category === 'oauth_callback') {
      threshold = getAnonThreshold(category)
      ttlSeconds = routeEntry.ttlSeconds ?? getAnonTtl(category)
    } else if (typeof identities.userTrustTier === 'number') {
      threshold = Math.ceil(getRateLimitThreshold(category, identities.userTrustTier) * multiplier)
      ttlSeconds = routeEntry.ttlSeconds ?? getRateLimitTtl(category)
    } else if (currentUser) {
      const context = await getUserRateLimitContext(currentUser.id)
      const tier = computeTrustTier(currentUser, context)
      threshold = Math.ceil(getRateLimitThreshold(category, tier) * multiplier)
      ttlSeconds = routeEntry.ttlSeconds ?? getRateLimitTtl(category)
    } else {
      threshold = Math.ceil(getAnonThreshold(category) * multiplier)
      ttlSeconds = routeEntry.ttlSeconds ?? getAnonTtl(category)
    }

    if (category !== 'oauth_callback' && identities.deviceClass === 'attested') {
      threshold = Math.ceil(threshold * getAttestedMultiplier())
    }
    return { threshold, ttlSeconds, failClosed: routeEntry.failClosed }
  },
})

export async function checkRouteRateLimit(
  routeKey: string,
  identities: RateLimitIdentities,
  currentUser: PrivateUser | null,
  options: RouteRateLimitCheckOptions = {},
): Promise<RouteRateLimitResult> {
  if (!isRouteRateLimitEnabled()) {
    return { limited: false, retryAfterSeconds: 0, limit: 0, remaining: 0 }
  }

  const keyIdentities = getRateLimitKeyDimensions(identities)
  return checkPublishedRouteLimit(routeKey, keyIdentities, { identities, currentUser }, options)
}

export { routeRateLimiters }
