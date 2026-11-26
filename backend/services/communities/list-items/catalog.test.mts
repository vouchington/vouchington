import { describe, expect, it } from 'vitest'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'
import type { CommunityListItemType } from '@voucha/types/entities/community'
import { communityListItemStorageCatalog } from './catalog.mts'

describe('community list item catalogs', () => {
  it('aligns backend storage metadata with public request body fields', () => {
    expect(Object.keys(communityListItemStorageCatalog)).toEqual(
      Object.keys(communityListItemTypeCatalog),
    )

    for (const itemType of Object.keys(communityListItemTypeCatalog) as CommunityListItemType[]) {
      expect(communityListItemStorageCatalog[itemType].entityColumn).toBe(
        communityListItemTypeCatalog[itemType].requestBodyIdField,
      )
    }

    expect(communityListItemStorageCatalog).toMatchObject({
      topic: {
        table: 'community_list_topics',
        entityTable: 'topics',
        entityColumn: 'topic_id',
        activeEntityFilter: 'AND deleted_at IS NULL',
      },
      rss_feed: {
        table: 'community_list_rss_feeds',
        entityTable: 'rss_feeds',
        entityColumn: 'rss_feed_id',
      },
      post: {
        table: 'community_list_posts',
        entityTable: 'posts',
        entityColumn: 'post_id',
        activeEntityFilter: 'AND deleted_at IS NULL',
      },
      url_hostname: {
        table: 'community_list_url_hostnames',
        entityTable: 'url_hostnames',
        entityColumn: 'url_hostname_id',
        activeEntityFilter: '',
      },
      url: {
        table: 'community_list_urls',
        entityTable: 'urls',
        entityColumn: 'url_id',
        activeEntityFilter: '',
      },
    })
    expect(communityListItemStorageCatalog.rss_feed.activeEntityFilter).toContain(
      'view_rss_feed_current_states',
    )
  })
})
