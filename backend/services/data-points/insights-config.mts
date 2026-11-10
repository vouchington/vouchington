import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const TOPIC_DATA_POINT_INSIGHTS_ROW_CAP_DEFAULT = 10_000
export const TOPIC_DATA_POINT_INSIGHTS_ROW_CAP_MAX = 100_000
export const TOPIC_DATA_POINT_INSIGHTS_WINDOW_YEARS_DEFAULT = 3
export const TOPIC_DATA_POINT_INSIGHTS_WINDOW_YEARS_MAX = 10

export const topicDataPointInsightsConfig = new DynamicConfig({
  key: 'topic-data-point-insights-config',
  fieldTypes: { row_cap: 'number', window_years: 'number' },
  defaultFields: {
    row_cap: TOPIC_DATA_POINT_INSIGHTS_ROW_CAP_DEFAULT,
    window_years: TOPIC_DATA_POINT_INSIGHTS_WINDOW_YEARS_DEFAULT,
  },
})

/** Public data points aggregated for one topic. */
export function getTopicDataPointInsightsRowCap(): number {
  return getBoundedPositiveIntegerField(topicDataPointInsightsConfig, 'row_cap', {
    defaultValue: TOPIC_DATA_POINT_INSIGHTS_ROW_CAP_DEFAULT,
    maxValue: TOPIC_DATA_POINT_INSIGHTS_ROW_CAP_MAX,
  })
}

/** UTC calendar years of data-point ids included in topic insights. */
export function getTopicDataPointInsightsWindowYears(): number {
  return getBoundedPositiveIntegerField(topicDataPointInsightsConfig, 'window_years', {
    defaultValue: TOPIC_DATA_POINT_INSIGHTS_WINDOW_YEARS_DEFAULT,
    maxValue: TOPIC_DATA_POINT_INSIGHTS_WINDOW_YEARS_MAX,
  })
}
