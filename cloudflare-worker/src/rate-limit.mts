import { API_ROUTE_RE } from './routing.mts'
import { isActivityPubInboxDeliveryRequest } from './activitypub-inbox-rate-limit.mts'
import { buildEdgeRateLimitKey, checkEdgeBuckets } from '@vouchington/rate-limit/edge'
import type { Env } from './types.mts'

interface BotRateLimitInput {
  env: Pick<
    Env,
    | 'RATE_LIMITER_BOT_GET_HEAD'
    | 'RATE_LIMITER_BOT_MUTATING'
    | 'RATE_LIMITER_GET_HEAD'
    | 'RATE_LIMITER_MUTATING'
  >
  method: string
  pathname: string
  ip: string | null
}

const getMethodClass = (method: string): 'GET' | 'MUTATING' =>
  method === 'GET' || method === 'HEAD' ? 'GET' : 'MUTATING'

const buildRateLimitKey = (
  prefix: string | null,
  pathname: string,
  method: string,
  ip: string,
): string => {
  const area = API_ROUTE_RE.test(pathname) ? 'api' : 'web'
  const baseKey = `${area}:${getMethodClass(method)}:${ip}`
  return prefix ? buildEdgeRateLimitKey(prefix, baseKey) : baseKey
}

// Checks the post-cache rate limit for unknown bots.
// Uses RATE_LIMITER_BOT_* bindings if configured, falling back to the normal bindings.
// Called only on cache MISS (and for non-cacheable requests) so cached responses are free.
export const checkBotRateLimit = async (input: BotRateLimitInput): Promise<boolean> => {
  if (isActivityPubInboxDeliveryRequest(input.method, input.pathname)) {
    return true
  }

  const isGetOrHead = input.method === 'GET' || input.method === 'HEAD'
  const binding = isGetOrHead
    ? (input.env.RATE_LIMITER_BOT_GET_HEAD ?? input.env.RATE_LIMITER_GET_HEAD)
    : (input.env.RATE_LIMITER_BOT_MUTATING ?? input.env.RATE_LIMITER_MUTATING)

  return checkEdgeBuckets(
    [{ binding, key: ip => buildRateLimitKey('bot', input.pathname, input.method, ip) }],
    input.ip,
  )
}
