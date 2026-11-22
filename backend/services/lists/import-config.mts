import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const LIST_IMPORT_CONFIG_KEY = 'list-import-config'
export const LIST_IMPORT_MAX_ITEMS = 500
export const COMMUNITY_LIST_MAX_FEEDS = 50
export const listImportMaxValues = {
  add_list_items_max: 100,
  import_feed_item_limit: 20,
} as const

export const listImportConfig = new DynamicConfig({
  key: LIST_IMPORT_CONFIG_KEY,
  fieldTypes: {
    max_items: 'number',
    max_community_list_feeds: 'number',
    add_list_items_max: 'number',
    import_feed_item_limit: 'number',
  },
  defaultFields: {
    max_items: LIST_IMPORT_MAX_ITEMS,
    max_community_list_feeds: COMMUNITY_LIST_MAX_FEEDS,
    ...listImportMaxValues,
  },
})

export function getListAddItemsLimit(): number {
  return getBoundedPositiveIntegerField(listImportConfig, 'add_list_items_max', {
    defaultValue: listImportMaxValues.add_list_items_max,
    maxValue: listImportMaxValues.add_list_items_max,
  })
}

export function getListImportFeedItemLimit(): number {
  return getBoundedPositiveIntegerField(listImportConfig, 'import_feed_item_limit', {
    defaultValue: listImportMaxValues.import_feed_item_limit,
    maxValue: listImportMaxValues.import_feed_item_limit,
  })
}

export function getListImportLimit(): number {
  return getBoundedPositiveIntegerField(listImportConfig, 'max_items', {
    defaultValue: LIST_IMPORT_MAX_ITEMS,
    maxValue: LIST_IMPORT_MAX_ITEMS,
  })
}

export function getCommunityListFeedLimit(): number {
  return getBoundedPositiveIntegerField(listImportConfig, 'max_community_list_feeds', {
    defaultValue: COMMUNITY_LIST_MAX_FEEDS,
    maxValue: COMMUNITY_LIST_MAX_FEEDS,
  })
}
