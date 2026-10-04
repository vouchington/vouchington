import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

const defaultFields = {
  leaderboard_page_size: 10,
}

/** Hard ceilings for the current runtime configuration contract. */
export const moderationAnalyticsWorkMaxValues = {
  leaderboard_page_size: 100,
}

export const moderationAnalyticsWorkConfig = new DynamicConfig({
  key: 'moderation-analytics-work-config',
  fieldTypes: {
    leaderboard_page_size: 'number',
  },
  defaultFields,
})

export function getModerationAnalyticsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(moderationAnalyticsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: moderationAnalyticsWorkMaxValues[field],
  })
}
