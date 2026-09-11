import type { ContributionPolicyAction, ContributionPolicyTier } from './limit-types.mts'
import type { ContributionPolicyActor } from './policy-actor.mts'

export type ContributionPolicyConfigSnapshot = Readonly<Record<string, number>>
export type ContributionPolicySource =
  | 'discussion'
  | 'review'
  | 'comment'
  | 'data_point'
  | 'link'
  | 'story'
  | 'rss_item_discussion'
  | 'topic_recommendation'
  | 'article'
  | 'blog_post'

export type ContributionPolicy = {
  global: ContributionPolicyWindowPair
  type: ContributionPolicyWindowPair
}

/** A bulk admission policy that deliberately cannot carry a short-window limit. */
export type ContributionDailyOnlyPolicy = Readonly<{
  kind: 'daily_only'
  global: ContributionPolicyWindow
  type: ContributionPolicyWindow
}>

export type ContributionAdmissionPolicy = ContributionPolicy | ContributionDailyOnlyPolicy

/** Records whether a committed admission participates in every policy window or only daily ones. */
export type ContributionAdmissionConsumptionMode = 'all_windows' | 'daily_only'

export function contributionAdmissionConsumptionMode(
  policy: ContributionAdmissionPolicy,
): ContributionAdmissionConsumptionMode {
  return 'kind' in policy ? 'daily_only' : 'all_windows'
}

export type ContributionPolicyWindowPair = Readonly<{
  short: ContributionPolicyWindow
  daily: ContributionPolicyWindow
}>

export type ContributionPolicyWindow = Readonly<{ limit: number; windowSeconds: number }>

export function resolveContributionPolicy(
  snapshot: ContributionPolicyConfigSnapshot,
  actor: ContributionPolicyActor,
  source: ContributionPolicySource,
): ContributionPolicy {
  if (source === 'article' || source === 'blog_post') {
    throw new Error(`${source} has no contribution policy; verify its exemption before resolving`)
  }
  const tier: Exclude<ContributionPolicyTier, 'safety'> | null =
    actor.tier === 'just_joined' ? null : actor.tier
  return {
    global: getPolicy(snapshot, 'authored_post', tier),
    type: getPolicy(snapshot, mapPolicyAction(source), tier),
  }
}

export function resolveContributionDailyOnlyPolicy(
  snapshot: ContributionPolicyConfigSnapshot,
  actor: ContributionPolicyActor,
  source: ContributionPolicySource,
): ContributionDailyOnlyPolicy {
  const policy = resolveContributionPolicy(snapshot, actor, source)
  return {
    kind: 'daily_only',
    global: policy.global.daily,
    type: policy.type.daily,
  }
}

function getPolicy(
  snapshot: ContributionPolicyConfigSnapshot,
  action: ContributionPolicyAction,
  tier: Exclude<ContributionPolicyTier, 'safety'> | null,
): ContributionPolicyWindowPair {
  if (tier === null) return fixedBlockedPolicy()
  return {
    short: getWindow(snapshot, action, tier, 'short'),
    daily: getWindow(snapshot, action, tier, 'daily'),
  }
}

function getWindow(
  snapshot: ContributionPolicyConfigSnapshot,
  action: ContributionPolicyAction,
  tier: Exclude<ContributionPolicyTier, 'safety'>,
  window: 'short' | 'daily',
): ContributionPolicyWindow {
  return {
    limit: requiredNumber(snapshot, `${action}_${tier}_${window}_limit`),
    windowSeconds: requiredNumber(snapshot, `${action}_${tier}_${window}_window_seconds`),
  }
}

function fixedBlockedPolicy(): ContributionPolicyWindowPair {
  return {
    short: { limit: 0, windowSeconds: 86_400 },
    daily: { limit: 0, windowSeconds: 86_400 },
  }
}

function requiredNumber(snapshot: ContributionPolicyConfigSnapshot, field: string): number {
  const value = snapshot[field]
  if (!Number.isFinite(value)) throw new Error(`Missing contribution policy field ${field}`)
  return value
}

function mapPolicyAction(
  source: Exclude<ContributionPolicySource, 'article' | 'blog_post'>,
): ContributionPolicyAction {
  if (source === 'link' || source === 'story' || source === 'rss_item_discussion')
    return 'discussion'
  return source
}
