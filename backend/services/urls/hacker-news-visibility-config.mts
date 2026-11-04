import { DynamicConfig } from '@data-stores/valkey'

export const hackerNewsVisibilityConfig = new DynamicConfig({
  key: 'hacker-news-visibility-config',
  fieldTypes: { references_visible: 'boolean', post_time_range_cap: 'string' },
  defaultFields: { references_visible: true, post_time_range_cap: '1y' },
})

export function areHackerNewsReferencesVisible(): boolean {
  return hackerNewsVisibilityConfig.fields.get('references_visible') !== false
}

export const HACKER_NEWS_POST_TIME_RANGES = ['1w', '1m', '1y', 'all'] as const
export type HackerNewsPostTimeRange = (typeof HACKER_NEWS_POST_TIME_RANGES)[number]

export function getHackerNewsPostTimeRangeCap(): HackerNewsPostTimeRange {
  const value = hackerNewsVisibilityConfig.fields.get('post_time_range_cap')
  return HACKER_NEWS_POST_TIME_RANGES.find(range => range === value) ?? '1y'
}
