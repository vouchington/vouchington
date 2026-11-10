import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import {
  TOPIC_DATA_POINT_INSIGHTS_ROW_CAP_MAX,
  TOPIC_DATA_POINT_INSIGHTS_WINDOW_YEARS_MAX,
  topicDataPointInsightsConfig,
} from '@services/data-points/insights-config'

export const topicDataPointInsightsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'topic-data-point-insights-config',
  label: 'Topic data point insights',
  description: 'Bounds the public data points aggregated for each topic insight.',
  config: topicDataPointInsightsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    row_cap: {
      description: 'Latest public data points aggregated for one topic.',
      minValue: 1,
      maxValue: TOPIC_DATA_POINT_INSIGHTS_ROW_CAP_MAX,
      integer: true,
    },
    window_years: {
      description: 'UTC calendar years of data-point ids included for each topic.',
      minValue: 1,
      maxValue: TOPIC_DATA_POINT_INSIGHTS_WINDOW_YEARS_MAX,
      integer: true,
    },
  },
})
