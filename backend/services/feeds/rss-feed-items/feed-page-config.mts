import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const rssFeedItemPageDefaults = {
  source_limit: 16,
  proxy_follow_input_limit: 8,
  community_list_input_limit: 16,
  story_item_limit: 4,
  eligibility_child_limit: 4,
  exclusion_relation_limit: 64,
  max_windows_per_page: 4,
} as const

export const rssFeedItemPageMaxima = {
  source_limit: 32,
  proxy_follow_input_limit: 16,
  community_list_input_limit: 32,
  story_item_limit: 8,
  eligibility_child_limit: 8,
  exclusion_relation_limit: 256,
  max_windows_per_page: 8,
} as const

export type RssFeedItemPageLimit = keyof typeof rssFeedItemPageDefaults

export const rssFeedItemPageConfig = new DynamicConfig({
  key: 'rss-feed-item-page-config',
  fieldTypes: {
    source_limit: 'number',
    proxy_follow_input_limit: 'number',
    community_list_input_limit: 'number',
    story_item_limit: 'number',
    eligibility_child_limit: 'number',
    exclusion_relation_limit: 'number',
    max_windows_per_page: 'number',
  },
  defaultFields: rssFeedItemPageDefaults,
})

export function getRssFeedItemPageLimit(field: RssFeedItemPageLimit): number {
  return getBoundedPositiveIntegerField(rssFeedItemPageConfig, field, {
    defaultValue: rssFeedItemPageDefaults[field],
    maxValue: rssFeedItemPageMaxima[field],
  })
}
