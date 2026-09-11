import { DynamicConfig } from '@data-stores/valkey'
import type { ContributionLimitTier } from '@services/contribution-gating/limit-types'

// Admin is intentionally excluded: unlimited is resolved in code (assert.mts short-circuits on
// tier === 'admin') so "unlimited" can never drift from a misconfigured Valkey field.
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

export function getManualTagLimit(tier: ManualTagLimitTier): number {
  const value = manualTagLimitConfig.getFields()[tier]
  return typeof value === 'number' ? value : DEFAULTS[tier]
}
