import type { BotTier } from './bot-tier.mts'
import { isActivityPubInboxDeliveryRequest } from './activitypub-inbox-rate-limit.mts'
import { edgeErrorResponse } from '@vouchington/edge'
import { getEdgeRateLimitRejection, hasAnyRateLimitBinding } from '@vouchington/rate-limit/edge'
import {
  getIdentityRateLimitBuckets,
  getServerActionRateLimitBuckets,
} from './identity-rate-limit.mts'
import type { Env } from './types.mts'

const RATE_LIMIT_BINDING_NAMES = [
  'RATE_LIMITER_GET_HEAD',
  'RATE_LIMITER_MUTATING',
  'RATE_LIMITER_BOT_GET_HEAD',
  'RATE_LIMITER_BOT_MUTATING',
  'RATE_LIMITER_ANON_GET_HEAD',
  'RATE_LIMITER_ANON_MUTATING',
  'RATE_LIMITER_SERVER_ACTION',
] as const

const missingIp = () => edgeErrorResponse(400, 'Bad Request', 'INVALID_INPUT')
const limited = () =>
  edgeErrorResponse(429, 'Too Many Requests', 'RATE_LIMIT', { 'retry-after': '60' })

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

  const buckets = getIdentityRateLimitBuckets({
    env,
    method,
    pathname,
    ip,
    isFullyCachedRoute: false,
    botTier,
    isServerAction,
  })

  return getEdgeRateLimitRejection({
    buckets,
    ip,
    hasAnyBinding: hasAnyRateLimitBinding(
      Object.fromEntries(RATE_LIMIT_BINDING_NAMES.map(name => [name, env[name]])),
      RATE_LIMIT_BINDING_NAMES,
    ),
    bypass: bypassesIdentityRateLimit,
    missingIp,
    limited,
  })
}

export async function getServerActionRateLimitRejection(
  env: Env,
  method: string,
  pathname: string,
  ip: string | null,
): Promise<Response | null> {
  return getEdgeRateLimitRejection({
    buckets: getServerActionRateLimitBuckets({ env, method, pathname, ip }),
    ip,
    hasAnyBinding: method === 'POST' && Boolean(env.RATE_LIMITER_SERVER_ACTION),
    bypass: method !== 'POST',
    missingIp,
    limited,
  })
}
