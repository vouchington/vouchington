import type { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { getContributionLimitValue, getContributionLimitWindowSeconds } from './limits-config.mts'
import { UNLIMITED_CONTRIBUTION_LIMIT } from './limit-defaults.mts'
import type {
  ContributionLimitAction,
  ContributionLimitTier,
  ContributionLimitUsage,
} from './limit-types.mts'

export async function checkWindow(
  limiter: RateLimiter,
  key: string,
  action: ContributionLimitAction,
  tier: ContributionLimitTier,
  window: 'short' | 'daily',
  increment: boolean,
): Promise<ContributionLimitUsage> {
  const limit = getContributionLimitValue(action, tier, window)
  const windowSeconds = getContributionLimitWindowSeconds(action, tier, window)
  if (limit === UNLIMITED_CONTRIBUTION_LIMIT) {
    return { limit, used: 0, window_seconds: windowSeconds }
  }
  if (limit <= 0) return { limit, used: 0, window_seconds: windowSeconds }

  const counts = increment
    ? (await limiter.addAndCheck([key], limit + 1, windowSeconds)).counts
    : await limiter.get([key], windowSeconds)
  const used = counts[0] ?? 0
  return { limit, used, window_seconds: windowSeconds }
}

export function isWindowAllowed(usage: ContributionLimitUsage, increment: boolean): boolean {
  if (usage.limit === UNLIMITED_CONTRIBUTION_LIMIT) return true
  if (usage.limit <= 0) return false
  return increment ? usage.used <= usage.limit : usage.used < usage.limit
}

export function limitKey(userId: string, action: ContributionLimitAction): string {
  return `${action}:${userId}`
}
