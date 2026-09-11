import { API_ROUTE_RE } from './routing.mts'
import { isActivityPubInboxDeliveryRequest } from './activitypub-inbox-rate-limit.mts'
import type { BotTier } from './bot-tier.mts'
import type { Env } from './types.mts'

interface RateLimitInput {
  env: Pick<Env, 'RATE_LIMITER_GET_HEAD' | 'RATE_LIMITER_MUTATING'>
  method: string
  pathname: string
  ip: string | null
  isFullyCachedRoute: boolean
  botTier: BotTier | null
}

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
  return prefix ? `${prefix}:${baseKey}` : baseKey
}

export const checkRateLimit = async (input: RateLimitInput): Promise<boolean> => {
  if (input.isFullyCachedRoute) {
    return true
  }

  const isGetOrHead = input.method === 'GET' || input.method === 'HEAD'

  // Unknown bot GET/HEAD requests skip pre-cache rate limiting — they will be
  // checked post-cache in checkBotRateLimit() so that cached responses are free.
  // Mutating requests still use the normal pre-cache bucket because there is no
  // cache hit path to protect from quota usage.
  if (input.botTier === 'unknown' && isGetOrHead) {
    return true
  }

  // OPTIONS (CORS preflight) falls through to RATE_LIMITER_MUTATING because CORS
  // is not supported in this worker — cross-origin fetches are blocked by CORP same-origin.
  // If CORS support is added in the future, OPTIONS should be added to the GET/HEAD branch
  // to avoid exhausting the mutating limit with high-frequency preflight requests.
  const binding = isGetOrHead ? input.env.RATE_LIMITER_GET_HEAD : input.env.RATE_LIMITER_MUTATING

  if (!binding) {
    return true
  }

  // Defence-in-depth guard: index.mts already returns 400 before calling checkRateLimit
  // when a binding is configured and ip is null. This guard protects against any future
  // caller that omits the pre-check.
  if (!input.ip) {
    return false
  }

  const result = await binding.limit({
    key: buildRateLimitKey(null, input.pathname, input.method, input.ip),
  })
  return result.success
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

  if (!binding) {
    return true
  }

  if (!input.ip) {
    return false
  }

  const result = await binding.limit({
    key: buildRateLimitKey('bot', input.pathname, input.method, input.ip),
  })
  return result.success
}
