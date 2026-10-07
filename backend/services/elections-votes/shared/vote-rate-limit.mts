import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { getElectionVoteRateLimitKeys } from './vote-route-utils.mts'

export const ENTITY_RELATION_VOTE_RATE_LIMIT_PREFIX = 'entity-relation-election-vote'

const VOTE_REQUESTS_PER_MINUTE = 30
const VOTE_WINDOW_SECONDS = 60
const limiters = new Map<string, RateLimiter>()

export async function chargeElectionVoteRateLimit(
  prefix: string,
  userId: string,
  ip: string | undefined,
  sessionData: { did: string; sid: string } | null,
): Promise<{ limited: boolean; retryAfterSeconds: number }> {
  let limiter = limiters.get(prefix)
  if (!limiter) {
    limiter = new RateLimiter({ prefix, ttlSeconds: VOTE_WINDOW_SECONDS })
    limiters.set(prefix, limiter)
  }
  const keys = getElectionVoteRateLimitKeys(userId, ip, sessionData)
  const { limited } = await limiter.addAndCheck(keys, VOTE_REQUESTS_PER_MINUTE + 1)
  return { limited, retryAfterSeconds: limited ? VOTE_WINDOW_SECONDS : 0 }
}
