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
  { description: string; min_value: number; max_value_exemption: string; integer: true }
> {
  const fields: Record<
    string,
    { description: string; min_value: number; max_value_exemption: string; integer: true }
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
      min_value: isWindow || isAuthoredPolicyField ? 1 : -1,
      max_value_exemption:
        'Contribution limits are operator policy values; validators enforce disabled sentinels and positive policy windows.',
      integer: true,
    }
  }
  return fields
}

function buildFields(value: 'number'): Record<string, 'number'> {
  return Object.fromEntries(getAllFieldNames().map(name => [name, value]))
}

function buildDefaultFields(): Record<string, number> {
  const fields: Record<string, number> = {}
  for (const action of contributionLimitActions) {
    if (action === 'article' || action === 'blog_post') continue
    for (const tier of contributionLimitTiers) {
      if (
        contributionPolicyActions.includes(action as ContributionPolicyAction) &&
        (tier === 'free' || tier === 'plus' || tier === 'pro')
      )
        continue
      addDefaults(fields, action, tier, CONTRIBUTION_LIMIT_DEFAULTS[action][tier])
    }
  }
  for (const action of contributionPolicyActions) {
    for (const tier of contributionPolicyTiers) {
      addDefaults(fields, action, tier, AUTHORED_CONTRIBUTION_POLICY_DEFAULTS[action][tier])
    }
  }
  return fields
}

function getAllFieldNames(): string[] {
  return Object.keys(buildDefaultFields())
}

function addDefaults(
  fields: Record<string, number>,
  action: ContributionLimitAction | ContributionPolicyAction,
  tier: ContributionLimitTier | ContributionPolicyTier,
  defaults: {
    shortLimit: number
    shortWindowSeconds: number
    dailyLimit: number
    dailyWindowSeconds: number
  },
): void {
  fields[limitField(action, tier, 'short')] = defaults.shortLimit
  fields[windowField(action, tier, 'short')] = defaults.shortWindowSeconds
  fields[limitField(action, tier, 'daily')] = defaults.dailyLimit
  fields[windowField(action, tier, 'daily')] = defaults.dailyWindowSeconds
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
