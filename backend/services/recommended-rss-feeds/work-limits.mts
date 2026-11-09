import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

const defaultFields = {
  collaborative_viewer_feed_limit: 10,
  collaborative_co_follower_limit: 25,
  collaborative_co_follower_feed_limit: 20,
}

/** Hard ceilings for the current runtime configuration contract. */
export const recommendedRssFeedsWorkMaxValues = {
  collaborative_viewer_feed_limit: 100,
  collaborative_co_follower_limit: 500,
  collaborative_co_follower_feed_limit: 100,
}

export const recommendedRssFeedsWorkConfig = new DynamicConfig({
  key: 'recommended-rss-feeds-work-config',
  fieldTypes: {
    collaborative_viewer_feed_limit: 'number',
    collaborative_co_follower_limit: 'number',
    collaborative_co_follower_feed_limit: 'number',
  },
  defaultFields,
})

export function getRecommendedRssFeedsWorkLimit(field: keyof typeof defaultFields): number {
  return getBoundedPositiveIntegerField(recommendedRssFeedsWorkConfig, field, {
    defaultValue: defaultFields[field],
    maxValue: recommendedRssFeedsWorkMaxValues[field],
  })
}
