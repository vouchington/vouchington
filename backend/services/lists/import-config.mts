import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const LIST_IMPORT_CONFIG_KEY = 'list-import-config'
export const LIST_IMPORT_MAX_ITEMS = 500
export const COMMUNITY_LIST_MAX_FEEDS = 50

export const listImportConfig = new DynamicConfig({
  key: LIST_IMPORT_CONFIG_KEY,
  fieldTypes: { max_items: 'number', max_community_list_feeds: 'number' },
  defaultFields: {
    max_items: LIST_IMPORT_MAX_ITEMS,
    max_community_list_feeds: COMMUNITY_LIST_MAX_FEEDS,
  },
})

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
