import { DynamicConfig } from '@data-stores/valkey'
import {
  AUTHORED_CONTRIBUTION_POLICY_DEFAULTS,
  CONTRIBUTION_LIMIT_DEFAULTS,
} from './limit-defaults.mts'
import {
  contributionLimitActions,
  contributionLimitTiers,
  contributionPolicyActions,
  contributionPolicyTiers,
  type ContributionLimitAction,
  type ContributionLimitTier,
  type ContributionPolicyAction,
  type ContributionPolicyTier,
} from './limit-types.mts'

export const CONTRIBUTION_LIMIT_CONFIG_KEY = 'contribution-rate-limits'

export const contributionLimitConfig = new DynamicConfig({
  key: CONTRIBUTION_LIMIT_CONFIG_KEY,
  fieldTypes: buildFields('number'),
  defaultFields: buildDefaultFields(),
})

export function getContributionLimitFieldNames(): string[] {
  return Object.keys(contributionLimitConfig.fieldTypes)
}

export function getContributionPolicyConfigSnapshot(): Readonly<Record<string, number>> {
  return Object.fromEntries(
    getContributionLimitFieldNames().map(field => [field, getConfigNumber(field)]),
  )
}

export function getContributionLimitValue(
  action: ContributionLimitAction,
  tier: ContributionLimitTier,
  window: 'short' | 'daily',
): number {
  if (action === 'article' || action === 'blog_post') return tier === 'admin' ? -1 : 0
  return getConfigNumber(limitField(action, tier, window))
}

export function getContributionLimitWindowSeconds(
  action: ContributionLimitAction,
  tier: ContributionLimitTier,
  window: 'short' | 'daily',
): number {
  if (action === 'article' || action === 'blog_post') return 86_400
  return getConfigNumber(windowField(action, tier, window))
}

export function contributionLimitFieldMetadata(): Record<
  string,
  { description: string; minValue: number; maxValue: number; integer: true }
> {
  const fields: Record<
    string,
    { description: string; minValue: number; maxValue: number; integer: true }
  > = {}
  for (const field of getContributionLimitFieldNames()) {
    const isWindow = field.endsWith('_window_seconds')
    const isAuthoredPolicyField = contributionPolicyActions.some(
      action =>
        field.startsWith(`${action}_`) &&
        (action === 'authored_post' || /_(free|plus|pro|safety)_/.test(field)),
    )
    fields[field] = {
      description: `${formatContributionLabel(field)} contribution policy value.`,
      minValue: isWindow || isAuthoredPolicyField ? 1 : -1,
      maxValue: isWindow ? 31_536_000 : 1_000_000,
      integer: true,
    }
  }
  return fields
}

function buildFields(value: 'number'): Record<string, 'number'> {
  return Object.fromEntries(getAllFieldNames().map(name => [name, value]))
}

function buildDefaultFields(): Record<string, number> {
  const limitEntries = contributionLimitActions.flatMap(action =>
    action === 'article' || action === 'blog_post'
      ? []
      : contributionLimitTiers.flatMap(tier =>
          usesAuthoredPolicyDefaults(action, tier)
            ? []
            : defaultEntries(action, tier, CONTRIBUTION_LIMIT_DEFAULTS[action][tier]),
        ),
  )
  const policyEntries = contributionPolicyActions.flatMap(action =>
    contributionPolicyTiers.flatMap(tier =>
      defaultEntries(action, tier, AUTHORED_CONTRIBUTION_POLICY_DEFAULTS[action][tier]),
    ),
  )
  return Object.fromEntries([...limitEntries, ...policyEntries])
}

/** A policy action's free, plus and pro tiers take their defaults from the authored policy table. */
function usesAuthoredPolicyDefaults(
  action: ContributionLimitAction,
  tier: ContributionLimitTier,
): boolean {
  return (
    contributionPolicyActions.includes(action as ContributionPolicyAction) &&
    (tier === 'free' || tier === 'plus' || tier === 'pro')
  )
}

function getAllFieldNames(): string[] {
  return Object.keys(buildDefaultFields())
}

function defaultEntries(
  action: ContributionLimitAction | ContributionPolicyAction,
  tier: ContributionLimitTier | ContributionPolicyTier,
  defaults: {
    shortLimit: number
    shortWindowSeconds: number
    dailyLimit: number
    dailyWindowSeconds: number
  },
): [string, number][] {
  return [
    [limitField(action, tier, 'short'), defaults.shortLimit],
    [windowField(action, tier, 'short'), defaults.shortWindowSeconds],
    [limitField(action, tier, 'daily'), defaults.dailyLimit],
    [windowField(action, tier, 'daily'), defaults.dailyWindowSeconds],
  ]
}

function getConfigNumber(field: string): number {
  const value = contributionLimitConfig.getFields()[field]
  if (typeof value === 'number') return value
  const fallback = contributionLimitConfig.defaultFields[field]
  if (typeof fallback === 'number') return fallback
  throw new Error(`Missing numeric contribution limit default for ${field}`)
}

function windowField(action: string, tier: string, window: 'short' | 'daily'): string {
  return `${action}_${tier}_${window}_window_seconds`
}

function limitField(action: string, tier: string, window: 'short' | 'daily'): string {
  return `${action}_${tier}_${window}_limit`
}

function formatContributionLabel(value: string): string {
  return value.replaceAll('_', ' ')
}
