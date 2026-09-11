import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONTRIBUTION_QUOTA_EXCEEDED, INVALID_INPUT } from '@modules/on-error/error-codes'
import type { BasicUser } from '@voucha/types/entities/user'
import { CONTRIBUTION_GATE_ACCOUNT_AGE_MS } from './config.mts'
import { getContributionLimitValue, getContributionLimitWindowSeconds } from './limits-config.mts'
import { checkWindow, isWindowAllowed, limitKey } from './limits-helpers.mts'
import { UNLIMITED_CONTRIBUTION_LIMIT } from './limit-defaults.mts'
import type {
  ContributionActionLimitStatus,
  ContributionLimitAction,
  ContributionLimitMembershipPlan,
  ContributionLimitTier,
  ContributionLimitUsage,
} from './limit-types.mts'

const SHORT_PREFIX = 'contribution-action-short'
const DAILY_PREFIX = 'contribution-action-daily'

const shortLimiter = new RateLimiter({ prefix: SHORT_PREFIX, ttlSeconds: 60 })
const dailyLimiter = new RateLimiter({ prefix: DAILY_PREFIX, ttlSeconds: 86_400 })

export function getContributionLimitTier(
  currentUser: BasicUser,
  membershipPlan: ContributionLimitMembershipPlan,
): ContributionLimitTier {
  if (currentUser.roles.includes('administrator')) return 'admin'
  if (membershipPlan === 'pro') return 'pro'
  if (membershipPlan === 'plus') return 'plus'
  const createdAt = getDateFromUUIDv7(currentUser.id)
  if (createdAt && Date.now() - createdAt.getTime() < CONTRIBUTION_GATE_ACCOUNT_AGE_MS) {
    return 'just_joined'
  }
  return 'free'
}

export async function assertWithinContributionActionLimit(
  currentUser: BasicUser,
  membershipPlan: ContributionLimitMembershipPlan,
  action: ContributionLimitAction,
): Promise<void> {
  const status = await checkContributionActionLimit(currentUser, membershipPlan, action, true)
  if (!status.allowed) {
    throw createCodedError(
      429,
      'Contribution limit exceeded. Please try again later.',
      CONTRIBUTION_QUOTA_EXCEEDED,
    )
  }
}

export async function assertWithinContributionDailyLimit(
  currentUser: BasicUser,
  membershipPlan: ContributionLimitMembershipPlan,
  action: ContributionLimitAction,
): Promise<void> {
  const status = await checkContributionDailyLimit(currentUser, membershipPlan, action, true)
  if (!status.allowed) {
    throw createCodedError(
      429,
      'Contribution limit exceeded. Please try again later.',
      CONTRIBUTION_QUOTA_EXCEEDED,
    )
  }
}

export function getContributionActionLimitStatus(
  currentUser: BasicUser,
  membershipPlan: ContributionLimitMembershipPlan,
  action: ContributionLimitAction,
): Promise<ContributionActionLimitStatus> {
  return checkContributionActionLimit(currentUser, membershipPlan, action, false)
}

export function getContributionLimitActionForPostType(
  postType: string | undefined,
): ContributionLimitAction {
  if (postType === undefined) return 'discussion'
  if (postType === 'review') return 'review'
  if (postType === 'comment') return 'comment'
  if (postType === 'data_point') return 'data_point'
  if (postType === 'article') return 'article'
  if (postType === 'blog_post') return 'blog_post'
  if (postType === 'discussion') return 'discussion'
  if (postType === 'link') return 'discussion'
  throw createCodedError(422, 'Unsupported post_type', INVALID_INPUT)
}

async function checkContributionActionLimit(
  currentUser: BasicUser,
  membershipPlan: ContributionLimitMembershipPlan,
  action: ContributionLimitAction,
  increment: boolean,
): Promise<ContributionActionLimitStatus> {
  const tier = getContributionLimitTier(currentUser, membershipPlan)
  const key = limitKey(currentUser.id, action)
  const shortLimit = getContributionLimitValue(action, tier, 'short')
  const shortWindowSeconds = getContributionLimitWindowSeconds(action, tier, 'short')
  const dailyLimit = getContributionLimitValue(action, tier, 'daily')
  const dailyWindowSeconds = getContributionLimitWindowSeconds(action, tier, 'daily')

  // Batch both windows in one round trip when incrementing and both limits are finite and positive.
  // addAndCheckWindows requires a write call; the sequential path handles read-only checks.
  if (
    increment &&
    shortLimit !== UNLIMITED_CONTRIBUTION_LIMIT &&
    shortLimit > 0 &&
    dailyLimit !== UNLIMITED_CONTRIBUTION_LIMIT &&
    dailyLimit > 0
  ) {
    const { counts } = await RateLimiter.addAndCheckWindows(
      [
        {
          prefix: SHORT_PREFIX,
          id: key,
          ttlSeconds: shortWindowSeconds,
          threshold: shortLimit + 1,
        },
        {
          prefix: DAILY_PREFIX,
          id: key,
          ttlSeconds: dailyWindowSeconds,
          threshold: dailyLimit + 1,
        },
      ],
      { mode: 'stop-on-limited' },
    )
    const shortWindow: ContributionLimitUsage = {
      limit: shortLimit,
      used: counts[0] ?? 0,
      window_seconds: shortWindowSeconds,
    }
    const dailyWindow: ContributionLimitUsage = {
      limit: dailyLimit,
      // counts[1] is 0 when the short window blocks (stop-on-limited skips the daily ZCOUNT);
      // safe today because callers only read .allowed, but do not log/expose used downstream.
      used: counts[1] ?? 0,
      window_seconds: dailyWindowSeconds,
    }
    const shortAllowed = isWindowAllowed(shortWindow, true)
    return {
      action,
      tier,
      allowed: shortAllowed && isWindowAllowed(dailyWindow, shortAllowed),
      short_window: shortWindow,
      daily_window: dailyWindow,
    }
  }

  // Sequential path for reads, unlimited limits, or zero limits
  const shortWindow = await checkWindow(shortLimiter, key, action, tier, 'short', increment)
  const dailyIncrement = increment && isWindowAllowed(shortWindow, increment)
  const dailyWindow = await checkWindow(dailyLimiter, key, action, tier, 'daily', dailyIncrement)
  return {
    action,
    tier,
    allowed:
      isWindowAllowed(shortWindow, increment) && isWindowAllowed(dailyWindow, dailyIncrement),
    short_window: shortWindow,
    daily_window: dailyWindow,
  }
}

async function checkContributionDailyLimit(
  currentUser: BasicUser,
  membershipPlan: ContributionLimitMembershipPlan,
  action: ContributionLimitAction,
  increment: boolean,
): Promise<ContributionActionLimitStatus> {
  const tier = getContributionLimitTier(currentUser, membershipPlan)
  const key = limitKey(currentUser.id, action)
  const shortWindow = await checkWindow(shortLimiter, key, action, tier, 'short', false)
  const dailyWindow = await checkWindow(dailyLimiter, key, action, tier, 'daily', increment)
  return {
    action,
    tier,
    allowed: isWindowAllowed(dailyWindow, increment),
    short_window: shortWindow,
    daily_window: dailyWindow,
  }
}
