import { DynamicConfig } from '@data-stores/valkey'
import type { ContributionLimitTier } from '@services/contribution-gating/limit-types'

// Administrators use the fixed ceiling rather than an operator-configurable tier.
export const MAX_MANUAL_TAGS = 20
export type ManualTagLimitTier = Exclude<ContributionLimitTier, 'admin'>

const DEFAULTS: Record<ManualTagLimitTier, number> = {
  just_joined: 3,
  free: 3,
  plus: 7,
  pro: 15,
}

export const MANUAL_TAG_LIMIT_CONFIG_KEY = 'manual-tag-limits'

export const manualTagLimitConfig = new DynamicConfig({
  key: MANUAL_TAG_LIMIT_CONFIG_KEY,
  fieldTypes: {
    just_joined: 'number',
    free: 'number',
    plus: 'number',
    pro: 'number',
  },
  defaultFields: DEFAULTS,
})

export function getManualTagLimit(tier: ContributionLimitTier): number {
  if (tier === 'admin') return MAX_MANUAL_TAGS
  const value = manualTagLimitConfig.getFields()[tier]
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_MANUAL_TAGS, Math.max(0, Math.trunc(value)))
    : DEFAULTS[tier]
}
