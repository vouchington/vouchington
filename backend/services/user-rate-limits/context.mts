import { ValkeyCache } from '@data-stores/valkey/cache'
import { getUserActiveMembership } from '@services/memberships/get'
import type { TrustTierContext } from './types.mts'

const FIVE_MINUTES_IN_SECONDS = 5 * 60

const rateLimitContextCache = new ValkeyCache<string>({
  prefix: 'user-rl-ctx',
  ttlSeconds: FIVE_MINUTES_IN_SECONDS,
  mode: 'text',
})

async function fetchRateLimitContext(userId: string): Promise<TrustTierContext> {
  const membership = await getUserActiveMembership(userId)
  return {
    membershipPlan: membership?.plan ?? null,
    membershipExpiresAt: membership?.expires_at ?? null,
  }
}

const getCachedContext = rateLimitContextCache.cacheGetByAny(
  async (userId: string): Promise<string | null> => {
    const context = await fetchRateLimitContext(userId)
    return JSON.stringify(context)
  },
)

export async function getUserRateLimitContext(userId: string): Promise<TrustTierContext> {
  const cached = await getCachedContext(userId)
  if (cached) {
    try {
      const context = JSON.parse(cached) as {
        membershipPlan?: TrustTierContext['membershipPlan']
        membershipExpiresAt?: string | null
      }
      if (context.membershipPlan && !('membershipExpiresAt' in context)) {
        await rateLimitContextCache.delete(userId)
        return fetchRateLimitContext(userId)
      }
      const membershipExpiresAt = context.membershipExpiresAt
        ? new Date(context.membershipExpiresAt)
        : null
      if (membershipExpiresAt && membershipExpiresAt <= new Date()) {
        await rateLimitContextCache.delete(userId)
        return fetchRateLimitContext(userId)
      }
      return {
        membershipPlan: context.membershipPlan ?? null,
        membershipExpiresAt,
      }
    } catch {
      await rateLimitContextCache.delete(userId)
    }
  }
  return { membershipPlan: null, membershipExpiresAt: null }
}

export { rateLimitContextCache }
