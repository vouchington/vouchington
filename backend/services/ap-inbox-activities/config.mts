import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const DEFAULT_MAXIMUM_ACTIVITY_AGE_DAYS = 30
export const MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT = 365

export const activityPubInboxConfig = new DynamicConfig({
  key: 'activitypub-inbox',
  fieldTypes: { async_delivery_enabled: 'boolean', maximum_activity_age_days: 'number' },
  defaultFields: {
    async_delivery_enabled: false,
    maximum_activity_age_days: DEFAULT_MAXIMUM_ACTIVITY_AGE_DAYS,
  },
})

export function isAsyncActivityPubInboxDeliveryEnabled(): boolean {
  return activityPubInboxConfig.getFields().async_delivery_enabled === true
}

export function getMaximumActivityAgeDays(): number {
  return getBoundedPositiveIntegerField(activityPubInboxConfig, 'maximum_activity_age_days', {
    defaultValue: DEFAULT_MAXIMUM_ACTIVITY_AGE_DAYS,
    maxValue: MAXIMUM_ACTIVITY_AGE_DAYS_LIMIT,
  })
}
