import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import type { MembershipPlanSlug } from '@services/memberships/types'
import { DAILY_QUOTAS } from './config.mts'

const quotaRateLimiter = new RateLimiter({
  prefix: 'contribution-quota',
  ttlSeconds: 24 * 60 * 60, // 24 hours
})

/**
 * Increments the contribution counter for the user and throws if the daily quota is exceeded.
 * Admin users bypass the quota check entirely.
 */
export async function assertWithinContributionQuota(
  userId: string,
  isAdmin: boolean,
  membershipPlan: MembershipPlanSlug | null,
): Promise<void> {
  if (isAdmin) return

  const planKey = membershipPlan ?? 'free'
  const limit = DAILY_QUOTAS[planKey]
  if (limit === Infinity) return

  // threshold = limit + 1 so users can make exactly `limit` successful calls;
  // addAndCheck limits when count >= threshold, so threshold=limit would allow only limit-1 calls.
  const { limited } = await quotaRateLimiter.addAndCheck([userId], limit + 1)
  if (limited) {
    throw createCodedError(
      429,
      'Daily contribution quota exceeded. Please try again tomorrow.',
      CONTRIBUTION_QUOTA_EXCEEDED,
    )
  }
}

/**
 * Returns the current contribution quota usage without incrementing the counter.
 * Returns limit=-1 for unlimited (admin or Infinity).
 */
export async function getContributionQuota(
  userId: string,
  isAdmin: boolean,
  membershipPlan: MembershipPlanSlug | null,
): Promise<{ used: number; limit: number }> {
  if (isAdmin) {
    const counts = await quotaRateLimiter.get([userId])
    return { used: counts[0] ?? 0, limit: -1 }
  }

  const planKey = membershipPlan ?? 'free'
  const limit = DAILY_QUOTAS[planKey]
  const counts = await quotaRateLimiter.get([userId])
  return { used: counts[0] ?? 0, limit: limit === Infinity ? -1 : limit }
}
