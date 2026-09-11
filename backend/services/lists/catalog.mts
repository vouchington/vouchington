import type { ListItemType } from './types.mts'

type ListItemStorageConfig = {
  table: string
  entityColumn: string
}

export const listItemStorageCatalog = {
  rss_feed_item: {
    table: 'list_items__rss_feed_items',
    entityColumn: 'rss_feed_item_id',
  },
  post: {
    table: 'list_items__posts',
    entityColumn: 'post_id',
  },
} as const satisfies Record<ListItemType, ListItemStorageConfig>

export function getListItemStorageConfig(itemType: ListItemType) {
  return listItemStorageCatalog[itemType]
}
