import type { communityListItemTypeCatalog } from './community-list-item-type.mts'

export type CommunityListItemStorageConfig = {
  table: string
  entityTable: string
  entityColumn: string
  activeEntityFilter: string
}

export const communityListItemStorageCatalog = {
  topic: {
    table: 'community_list_items__topics',
    entityTable: 'topics',
    entityColumn: 'topic_id',
    activeEntityFilter: 'AND deleted_at IS NULL',
  },
  rss_feed: {
    table: 'community_list_items__rss_feeds',
    entityTable: 'rss_feeds',
    entityColumn: 'rss_feed_id',
    activeEntityFilter: `AND deleted_at IS NULL AND EXISTS (
    SELECT 1
    FROM view_rss_feed_current_states current_state
    WHERE current_state.rss_feed_id = rss_feeds.id
      AND current_state.is_enabled = TRUE
  )`,
  },
  post: {
    table: 'community_list_items__posts',
    entityTable: 'posts',
    entityColumn: 'post_id',
    activeEntityFilter: 'AND deleted_at IS NULL',
  },
  url_hostname: {
    table: 'community_list_items__url_hostnames',
    entityTable: 'url_hostnames',
    entityColumn: 'url_hostname_id',
    activeEntityFilter: '',
  },
  url: {
    table: 'community_list_items__urls',
    entityTable: 'urls',
    entityColumn: 'url_id',
    activeEntityFilter: '',
  },
} as const satisfies Record<
  keyof typeof communityListItemTypeCatalog,
  CommunityListItemStorageConfig
>

export function getCommunityListItemStorageConfig(
  itemType: keyof typeof communityListItemTypeCatalog,
) {
  return communityListItemStorageCatalog[itemType]
}
