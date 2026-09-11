import { describe, expect, it } from 'vitest'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'
import type { CommunityListItemType } from '@voucha/types/entities/community'
import { communityListItemStorageCatalog } from './catalog.mts'

describe('community list item catalogs', () => {
  it('defines public metadata for every supported item type', () => {
    expect(Object.keys(communityListItemTypeCatalog)).toEqual([
      'topic',
      'rss_feed',
      'post',
      'url_hostname',
      'url',
    ])
    expect(communityListItemTypeCatalog).toMatchObject({
      topic: {
        apiPathSegment: 'topics',
        webPathSegment: 'topics',
        requestBodyIdField: 'topic_id',
        label: 'Topic',
        labelPlural: 'Topics',
        searchLabel: 'topics',
      },
      rss_feed: {
        apiPathSegment: 'rss-feeds',
        webPathSegment: 'feeds',
        requestBodyIdField: 'rss_feed_id',
        label: 'Source',
        labelPlural: 'Sources',
        searchLabel: 'sources',
      },
      post: {
        apiPathSegment: 'posts',
        webPathSegment: 'posts',
        requestBodyIdField: 'post_id',
        label: 'Post',
        labelPlural: 'Posts',
        searchLabel: 'posts',
      },
      url_hostname: {
        apiPathSegment: 'domains',
        webPathSegment: 'domains',
        requestBodyIdField: 'url_hostname_id',
        label: 'Domain',
        labelPlural: 'Domains',
        searchLabel: 'domains',
      },
      url: {
        apiPathSegment: 'urls',
        webPathSegment: 'urls',
        requestBodyIdField: 'url_id',
        label: 'URL',
        labelPlural: 'URLs',
        searchLabel: 'URLs',
      },
    })
  })

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
        table: 'community_list_items__topics',
        entityTable: 'topics',
        entityColumn: 'topic_id',
        activeEntityFilter: 'AND deleted_at IS NULL',
      },
      rss_feed: {
        table: 'community_list_items__rss_feeds',
        entityTable: 'rss_feeds',
        entityColumn: 'rss_feed_id',
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
    })
    expect(communityListItemStorageCatalog.rss_feed.activeEntityFilter).toContain(
      'view_rss_feed_current_states',
    )
  })
})
