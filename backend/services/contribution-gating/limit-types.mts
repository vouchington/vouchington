import type { MembershipPlanSlug } from '@services/memberships/types'

export const contributionLimitActions = [
  'topic',
  'topic_recommendation',
  'discussion',
  'review',
  'comment',
  'data_point',
  'article',
  'blog_post',
  'community',
  'rss_feed',
  'post_rating',
  'fediverse_instance',
] as const

export const contributionLimitTiers = ['just_joined', 'free', 'plus', 'pro', 'admin'] as const

export type ContributionLimitAction = (typeof contributionLimitActions)[number]
export type ContributionLimitTier = (typeof contributionLimitTiers)[number]

/** Internal policy buckets. These never cross the contribution-status API boundary. */
export const contributionPolicyActions = [
  'authored_post',
  'topic_recommendation',
  'discussion',
  'review',
  'comment',
  'data_point',
] as const

export const contributionPolicyTiers = ['free', 'plus', 'pro', 'safety'] as const

export type ContributionPolicyAction = (typeof contributionPolicyActions)[number]
export type ContributionPolicyTier = (typeof contributionPolicyTiers)[number]

export type ContributionLimitMembershipPlan = MembershipPlanSlug | null

export type ContributionLimitUsage = {
  limit: number
  used: number
  window_seconds: number
}

export type ContributionActionLimitStatus = {
  action: ContributionLimitAction
  tier: ContributionLimitTier
  allowed: boolean
  short_window: ContributionLimitUsage
  daily_window: ContributionLimitUsage
}
