import type { Env } from './types.mts'

export function hasAnyRateLimiter(env: Env): boolean {
  return Boolean(
    env.RATE_LIMITER_GET_HEAD ||
    env.RATE_LIMITER_MUTATING ||
    env.RATE_LIMITER_BOT_GET_HEAD ||
    env.RATE_LIMITER_BOT_MUTATING ||
    env.RATE_LIMITER_ANON_GET_HEAD ||
    env.RATE_LIMITER_ANON_MUTATING ||
    env.RATE_LIMITER_SERVER_ACTION,
  )
}
