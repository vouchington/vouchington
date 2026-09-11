import type {
  ContributionLimitAction,
  ContributionLimitTier,
  ContributionPolicyAction,
  ContributionPolicyTier,
} from './limit-types.mts'

export type LimitDefaults = {
  shortLimit: number
  shortWindowSeconds: number
  dailyLimit: number
  dailyWindowSeconds: number
}

export const UNLIMITED_CONTRIBUTION_LIMIT = -1
const DAY = 86_400

/** Existing public action/status defaults. Safety fields are defined separately below. */
export const CONTRIBUTION_LIMIT_DEFAULTS: Record<
  ContributionLimitAction,
  Record<ContributionLimitTier, LimitDefaults>
> = {
  topic: tiered(cell(0, DAY, 0), cell(0, DAY, 0), cell(0, DAY, 0), cell(0, DAY, 0)),
  topic_recommendation: tiered(
    cell(0, DAY, 0),
    cell(1, 3_600, 3),
    cell(1, 1_800, 5),
    cell(1, 900, 10),
  ),
  discussion: tiered(cell(0, DAY, 0), cell(1, 3_600, 3), cell(1, 1_800, 5), cell(1, 900, 10)),
  review: tiered(cell(0, DAY, 0), cell(1, 3_600, 1), cell(1, 1_800, 2), cell(1, 600, 3)),
  comment: tiered(cell(0, DAY, 0), cell(1, 900, 10), cell(1, 600, 25), cell(1, 300, 50)),
  data_point: tiered(cell(0, DAY, 0), cell(1, 3_600, 5), cell(1, 1_800, 10), cell(1, 900, 20)),
  article: tiered(cell(0, DAY, 0), cell(0, DAY, 0), cell(0, DAY, 0), cell(0, DAY, 0)),
  blog_post: tiered(cell(0, DAY, 0), cell(0, DAY, 0), cell(0, DAY, 0), cell(0, DAY, 0)),
  community: tiered(cell(1, DAY, 1), cell(1, 43_200, 2), cell(1, 3_600, 5), cell(1, 3_600, 10)),
  rss_feed: tiered(cell(1, 3_600, 5), cell(1, 300, 20), cell(1, 60, 100), cell(1, 30, 250)),
  post_rating: tiered(cell(0, DAY, 0), cell(1, 60, 25), cell(1, 30, 100), cell(1, 15, 250)),
  fediverse_instance: tiered(
    cell(1, 3_600, 5),
    cell(1, 300, 20),
    cell(1, 60, 100),
    cell(1, 30, 250),
  ),
}

/** Internal aggregate/type policy for the #10619 atomic counter rollout. */
export const AUTHORED_CONTRIBUTION_POLICY_DEFAULTS: Record<
  ContributionPolicyAction,
  Record<ContributionPolicyTier, LimitDefaults>
> = {
  authored_post: matrix(cell(1, 900, 10), cell(1, 600, 25), cell(1, 300, 50)),
  topic_recommendation: matrix(cell(1, 3_600, 3), cell(1, 1_800, 5), cell(1, 900, 10)),
  discussion: matrix(cell(1, 3_600, 3), cell(1, 1_800, 5), cell(1, 900, 10)),
  review: matrix(cell(1, 3_600, 1), cell(1, 1_800, 2), cell(1, 600, 3)),
  comment: matrix(cell(1, 900, 10), cell(1, 600, 25), cell(1, 300, 50)),
  data_point: matrix(cell(1, 3_600, 5), cell(1, 1_800, 10), cell(1, 900, 20)),
}

function tiered(
  justJoined: LimitDefaults,
  free: LimitDefaults,
  plus: LimitDefaults,
  pro: LimitDefaults,
): Record<ContributionLimitTier, LimitDefaults> {
  return {
    just_joined: justJoined,
    free,
    plus,
    pro,
    admin: cell(UNLIMITED_CONTRIBUTION_LIMIT, DAY, UNLIMITED_CONTRIBUTION_LIMIT),
  }
}

function matrix(
  free: LimitDefaults,
  plus: LimitDefaults,
  pro: LimitDefaults,
): Record<ContributionPolicyTier, LimitDefaults> {
  return { free, plus, pro, safety: pro }
}

function cell(shortLimit: number, shortWindowSeconds: number, dailyLimit: number): LimitDefaults {
  return { shortLimit, shortWindowSeconds, dailyLimit, dailyWindowSeconds: DAY }
}
