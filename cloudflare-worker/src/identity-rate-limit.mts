import { API_ROUTE_RE } from './routing.mts'
import { isActivityPubInboxDeliveryRequest } from './activitypub-inbox-rate-limit.mts'
import { buildEdgeRateLimitKey, type EdgeBucket } from '@vouchington/rate-limit/edge'
import type { BotTier } from './bot-tier.mts'
import type { Env } from './types.mts'

type EdgeRateLimitTier = 'anon' | 'server-action'
type RateLimitMethodClass = 'GET' | 'MUTATING'

interface IdentityRateLimitInput {
  env: Env
  method: string
  pathname: string
  ip: string | null
  /** True only when the gateway can answer inline or dispatch this request to Workers Cache. */
  isFullyCachedRoute: boolean
  botTier: BotTier | null
  /**
   * True when the request is a Next.js Server Action (POST with `next-action` header).
   * Routes the request into the stricter RATE_LIMITER_SERVER_ACTION bucket as
   * defense-in-depth against any future RSC deserialize-DoS / RCE class bug.
   */
  isServerAction?: boolean
}

interface ServerActionRateLimitInput {
  env: Env
  method: string
  pathname: string
  ip: string | null
}

const getMethodClass = (method: string): RateLimitMethodClass =>
  method === 'GET' || method === 'HEAD' ? 'GET' : 'MUTATING'

const buildIdentityRateLimitKey = (
  tier: EdgeRateLimitTier,
  pathname: string,
  methodClass: RateLimitMethodClass,
  ip: string,
): string => {
  const area = API_ROUTE_RE.test(pathname) ? 'api' : 'web'
  return buildEdgeRateLimitKey(tier, area, methodClass, ip)
}

export function getIdentityRateLimitBuckets(input: IdentityRateLimitInput): EdgeBucket[] {
  if (input.isFullyCachedRoute || isActivityPubInboxDeliveryRequest(input.method, input.pathname)) {
    return []
  }

  const methodClass = getMethodClass(input.method)
  const isGetOrHead = methodClass === 'GET'

  // Unknown bot GET/HEAD requests skip pre-cache rate limiting — they will be
  // checked post-cache in checkBotRateLimit() so that cached responses are free.
  // Mutating requests still use the normal anonymous/server-action pre-cache
  // buckets because there is no cache hit path to protect from quota usage.
  if (input.botTier === 'unknown' && isGetOrHead) {
    return []
  }

  // The edge cannot check Valkey-backed revocation, so it must not grant higher
  // auth/premium rate-limit tiers from JWT claims alone. Backend route limits
  // apply authenticated trust tiers after authoritative auth resolution.
  // Server Actions are always POST. Restrict the bucket to POST so PUT/PATCH/DELETE
  // requests that happen to carry a next-action header are not misclassified.
  const isServerActionRequest = Boolean(input.isServerAction) && input.method === 'POST'
  const genericBinding = isGetOrHead
    ? (input.env.RATE_LIMITER_ANON_GET_HEAD ?? input.env.RATE_LIMITER_GET_HEAD)
    : (input.env.RATE_LIMITER_ANON_MUTATING ?? input.env.RATE_LIMITER_MUTATING)

  const serverActionBinding = isServerActionRequest ? input.env.RATE_LIMITER_SERVER_ACTION : null
  return [
    {
      binding: genericBinding,
      key: ip => buildIdentityRateLimitKey('anon', input.pathname, methodClass, ip),
    },
    {
      binding: serverActionBinding,
      key: ip => buildIdentityRateLimitKey('server-action', input.pathname, methodClass, ip),
    },
  ]
}

export function getServerActionRateLimitBuckets(input: ServerActionRateLimitInput): EdgeBucket[] {
  return [
    {
      binding: input.method === 'POST' ? input.env.RATE_LIMITER_SERVER_ACTION : null,
      key: ip => buildIdentityRateLimitKey('server-action', input.pathname, 'MUTATING', ip),
    },
  ]
}
