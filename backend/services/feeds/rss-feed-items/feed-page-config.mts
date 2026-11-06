import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const rssFeedItemPageDefaults = {
  source_limit: 16,
  items_per_source: 8,
  story_item_limit: 4,
  eligibility_child_limit: 4,
  share_limit: 16,
  exclusion_relation_limit: 64,
} as const

export const rssFeedItemPageMaxima = {
  source_limit: 32,
  items_per_source: 32,
  story_item_limit: 8,
  eligibility_child_limit: 8,
  share_limit: 32,
  exclusion_relation_limit: 256,
} as const

export type RssFeedItemPageLimit = keyof typeof rssFeedItemPageDefaults

export const rssFeedItemPageConfig = new DynamicConfig({
  key: 'rss-feed-item-page-config',
  fieldTypes: {
    source_limit: 'number',
    items_per_source: 'number',
    story_item_limit: 'number',
    eligibility_child_limit: 'number',
    share_limit: 'number',
    exclusion_relation_limit: 'number',
  },
  defaultFields: rssFeedItemPageDefaults,
})

export function getRssFeedItemPageLimit(field: RssFeedItemPageLimit): number {
  return getBoundedPositiveIntegerField(rssFeedItemPageConfig, field, {
    defaultValue: rssFeedItemPageDefaults[field],
    maxValue: rssFeedItemPageMaxima[field],
  })
}
