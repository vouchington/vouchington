import type { BotTier } from './bot-tier.mts'
import { isActivityPubInboxDeliveryRequest } from './activitypub-inbox-rate-limit.mts'
import { edgeErrorResponse } from './error-response.mts'
import { checkIdentityRateLimit, checkServerActionRateLimit } from './identity-rate-limit.mts'
import { hasAnyRateLimiter } from './request-rate-limiters.mts'
import type { Env } from './types.mts'

export async function getIdentityRateLimitRejection(
  env: Env,
  method: string,
  pathname: string,
  ip: string | null,
  isRateLimitExempt: boolean,
  botTier: BotTier | null,
  isServerAction: boolean,
): Promise<Response | null> {
  const ownsOriginRateLimit = isActivityPubInboxDeliveryRequest(method, pathname)
  const bypassesIdentityRateLimit = isRateLimitExempt || ownsOriginRateLimit

  if (!ip && !bypassesIdentityRateLimit && hasAnyRateLimiter(env)) {
    return edgeErrorResponse(400, 'Bad Request', 'INVALID_INPUT')
  }

  const allowed = await checkIdentityRateLimit({
    env,
    method,
    pathname,
    ip,
    isFullyCachedRoute: bypassesIdentityRateLimit,
    botTier,
    isServerAction,
  })

  if (!allowed) {
    return edgeErrorResponse(429, 'Too Many Requests', 'RATE_LIMIT', { 'retry-after': '60' })
  }

  return null
}

export async function getServerActionRateLimitRejection(
  env: Env,
  method: string,
  pathname: string,
  ip: string | null,
): Promise<Response | null> {
  if (!ip && method === 'POST' && env.RATE_LIMITER_SERVER_ACTION) {
    return edgeErrorResponse(400, 'Bad Request', 'INVALID_INPUT')
  }

  const allowed = await checkServerActionRateLimit({ env, method, pathname, ip })
  if (!allowed) {
    return edgeErrorResponse(429, 'Too Many Requests', 'RATE_LIMIT', { 'retry-after': '60' })
  }

  return null
}
