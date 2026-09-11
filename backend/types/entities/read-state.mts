export type ReadStateEntityType = 'rss_feed_item' | 'post'

type ReadStateStorageConfig = {
  table: string
  column: string
}

export const readStateStorageCatalog = {
  rss_feed_item: {
    table: 'rss_feed_item_read_states',
    column: 'rss_feed_item_id',
  },
  post: {
    table: 'post_read_states',
    column: 'post_id',
  },
} as const satisfies Record<ReadStateEntityType, ReadStateStorageConfig>

export function getReadStateStorageConfig(type: ReadStateEntityType) {
  return readStateStorageCatalog[type]
}
