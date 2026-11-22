import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  leaderboard_page_size: 10,
  transparency_release_batch_days: 1,
  transparency_release_lookback_days: 7,
  transparency_release_max_batches_per_run: 8,
}

/** Hard ceilings for the current runtime configuration contract. */
export const moderationAnalyticsWorkMaxValues = {
  leaderboard_page_size: 100,
  transparency_release_batch_days: 7,
  // Below the shortest 90-day source retention, so a lookback can never name a purged day.
  transparency_release_lookback_days: 60,
  transparency_release_max_batches_per_run: 60,
}

export const moderationAnalyticsWorkConfig = new DynamicConfig({
  key: 'moderation-analytics-work-config',
  fieldTypes: {
    leaderboard_page_size: 'number',
    transparency_release_batch_days: 'number',
    transparency_release_lookback_days: 'number',
    transparency_release_max_batches_per_run: 'number',
  },
  defaultFields,
})

export function getModerationAnalyticsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(moderationAnalyticsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: moderationAnalyticsWorkMaxValues[field],
  })
}
