/**
 * Contribution gating test helpers
 */

import { RateLimiter } from '@data-stores/valkey-rate-limiter'

/**
 * Safe test user age (8 days) for passing the 7-day contribution gate with a 1-day buffer.
 * Use this when creating test users that need to vote or post.
 */
export const CONTRIBUTING_USER_AGE_MS = 8 * 24 * 60 * 60 * 1000

/**
 * Reset the contribution quota for a user (for testing).
 * Deletes the rate limiter key so the user starts with a fresh daily quota.
 */
export async function resetContributionQuota(userId: string): Promise<void> {
  const limiter = new RateLimiter({ prefix: 'contribution-quota', ttlSeconds: 24 * 60 * 60 })
  await limiter.delete(userId)
}
