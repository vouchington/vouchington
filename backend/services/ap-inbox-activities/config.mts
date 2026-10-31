import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const DEFAULT_MAXIMUM_ACTIVITY_AGE_DAYS = 30
export const MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT = 365
// Longer than every configurable replay horizon, including a later policy increase.
export const MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS = MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT + 1
export const MAXIMUM_TERMINAL_IDENTITY_RETENTION_DAYS = 10 * MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT

export const activityPubInboxConfig = new DynamicConfig({
  key: 'activitypub-inbox',
  fieldTypes: {
    maximum_activity_age_days: 'number',
    terminal_identity_retention_days: 'number',
  },
  defaultFields: {
    maximum_activity_age_days: DEFAULT_MAXIMUM_ACTIVITY_AGE_DAYS,
    terminal_identity_retention_days: MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS,
  },
})

export function getMaximumActivityAgeDays(): number {
  return getBoundedPositiveIntegerField(activityPubInboxConfig, 'maximum_activity_age_days', {
    defaultValue: DEFAULT_MAXIMUM_ACTIVITY_AGE_DAYS,
    maxValue: MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT,
  })
}

/** Terminal identities outlive even a later increase to the maximum supported replay window. */
export function getTerminalActivityIdentityRetentionDays(): number {
  return Math.max(
    MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS,
    getBoundedPositiveIntegerField(activityPubInboxConfig, 'terminal_identity_retention_days', {
      defaultValue: MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS,
      maxValue: MAXIMUM_TERMINAL_IDENTITY_RETENTION_DAYS,
    }),
  )
}
