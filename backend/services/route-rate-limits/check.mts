import { RateLimiter } from '@data-stores/valkey-rate-limiter'
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
import { buildRateLimitKeys } from './identity.mts'
import type { RateLimitIdentities, RouteRateLimitResult, RouteRateLimitCategory } from './types.mts'
import onError from '@modules/on-error'

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
 * Fails open on Valkey errors.
 */
export async function checkRouteRateLimit(
  routeKey: string,
  identities: RateLimitIdentities,
  currentUser: PrivateUser | null,
): Promise<RouteRateLimitResult> {
  if (!isRouteRateLimitEnabled()) {
    return { limited: false, retryAfterSeconds: 0, limit: 0, remaining: 0 }
  }

  const routeEntry = getRouteConfig(routeKey)
  const { category } = routeEntry
  const multiplier = routeEntry.multiplier ?? 1

  let threshold: number
  let ttl: number

  if (category === 'oauth_callback') {
    threshold = getAnonThreshold(category)
    ttl = routeEntry.ttlSeconds ?? getAnonTtl(category)
  } else if (typeof identities.userTrustTier === 'number') {
    threshold = Math.ceil(getRateLimitThreshold(category, identities.userTrustTier) * multiplier)
    ttl = routeEntry.ttlSeconds ?? getRateLimitTtl(category)
  } else if (currentUser) {
    const context = await getUserRateLimitContext(currentUser.id)
    const tier = computeTrustTier(currentUser, context)
    threshold = Math.ceil(getRateLimitThreshold(category, tier) * multiplier)
    ttl = routeEntry.ttlSeconds ?? getRateLimitTtl(category)
  } else {
    threshold = Math.ceil(getAnonThreshold(category) * multiplier)
    ttl = routeEntry.ttlSeconds ?? getAnonTtl(category)
  }

  if (category !== 'oauth_callback' && identities.deviceClass === 'attested') {
    threshold = Math.ceil(threshold * getAttestedMultiplier())
  }

  const ids = buildRateLimitKeys(routeKey, identities)
  if (ids.length === 0) {
    return { limited: false, retryAfterSeconds: 0, limit: threshold, remaining: threshold }
  }

  const limiter = routeRateLimiters[category]

  try {
    const { counts, limited } = await limiter.addAndCheck(ids, threshold, ttl)
    const maxCount = counts.length > 0 ? Math.max(...counts) : 0
    return {
      limited,
      retryAfterSeconds: ttl,
      limit: threshold,
      remaining: Math.max(0, threshold - maxCount),
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    return { limited: false, retryAfterSeconds: 0, limit: threshold, remaining: threshold }
  }
}

export { routeRateLimiters }
