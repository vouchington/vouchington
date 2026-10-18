import {
  loadScript,
  RateLimiter,
  rateLimiterValkeyClient,
  registerScript,
} from '@data-stores/valkey-rate-limiter'
import type { BasicUser } from '@voucha/types/entities/user'
import { UNLIMITED_CONTRIBUTION_LIMIT } from './limit-defaults.mts'
import { getContributionLimitValue, getContributionLimitWindowSeconds } from './limits-config.mts'
import { createContributionLimitExceededError, limitKey } from './limits-helpers.mts'
import { getContributionLimitTier } from './limits.mts'
import type { ContributionLimitMembershipPlan } from './limit-types.mts'

const rssFeedDailyLimiter = new RateLimiter({
  prefix: 'contribution-action-daily',
  ttlSeconds: 86_400,
})
const dailyContributionAddOnceScript = registerScript(
  loadScript('daily-contribution-add-once.lua', import.meta.url),
)

/** Charge a durable import row at most once within the daily sliding window. */
export async function assertWithinRssFeedImportDailyLimit(
  currentUser: BasicUser,
  membershipPlan: ContributionLimitMembershipPlan,
  importRowId: string,
): Promise<void> {
  const action = 'rss_feed'
  const tier = getContributionLimitTier(currentUser, membershipPlan)
  const limit = getContributionLimitValue(action, tier, 'daily')
  if (limit === UNLIMITED_CONTRIBUTION_LIMIT) return
  if (limit <= 0) throw createContributionLimitExceededError()

  const windowSeconds = getContributionLimitWindowSeconds(action, tier, 'daily')
  const key = rssFeedDailyLimiter.getKey(limitKey(currentUser.id, action))
  const result = await rateLimiterValkeyClient.invokeScript(dailyContributionAddOnceScript, {
    keys: [key],
    args: [importRowId, String(limit), String(windowSeconds)],
  })
  if (result === 1 || result === 1n) return
  if (result === 0 || result === 0n) throw createContributionLimitExceededError()
  throw new Error('Unexpected daily contribution admission result')
}
