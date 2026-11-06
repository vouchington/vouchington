import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedOptions } from '../../types.mts'
import { appendDirectCandidateCTE } from './direct-candidate-cte.mts'
import { appendDirectWinnerCTE } from './direct-winner-cte.mts'
import { appendSharedItemPoolCTEs } from './shared-item-pool-cte.mts'

export function appendDeliveryCTEs(
  query: SQLStatement,
  {
    communityId,
    cutoffDate,
    currentUserId,
    currentUserIsAdministrator,
    feedType,
    hasRelatedPosts,
    hasHackerNewsReferences,
    includeDirectItems,
    includeSharedItems,
    itemCutoffId,
    mediaTypes,
    minScoreFollowRssFeeds,
    minScoreFollowTopics,
    textSearchQuery,
    topicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    sourceLimit,
    pageSize,
    storyItemLimit,
    eligibilityChildLimit,
    proxyFollowInputLimit,
    cursorSortAt,
    cursorId,
    cursorInclusive,
  }: {
    communityId?: string
    cutoffDate: Date | null
    currentUserId?: string
    currentUserIsAdministrator: boolean
    feedType: RssFeedItemFeedOptions['feed_type']
    hasRelatedPosts: boolean | undefined
    hasHackerNewsReferences?: boolean
    includeDirectItems: boolean
    includeSharedItems: boolean
    itemCutoffId: string | null
    mediaTypes: string[]
    minScoreFollowRssFeeds: number
    minScoreFollowTopics: number
    textSearchQuery: string | undefined
    topicIds: string[] | undefined
    hashtagTopicIds: string[] | undefined
    hashtagAliasIds: string[] | undefined
    hasUnknownHashtag: boolean | undefined
    sourceLimit: number
    pageSize: number
    storyItemLimit: number
    proxyFollowInputLimit: number
    eligibilityChildLimit: number
    cursorSortAt?: string
    cursorId?: string
    cursorInclusive?: boolean
  },
): SQLStatement {
  appendSharedItemPoolCTEs(query, {
    cutoffDate,
    currentUserId,
    includeSharedItems,
    pageSize,
    cursorSortAt,
    cursorId,
    cursorInclusive,
  })
  appendDirectCandidateCTE(query, {
    communityId,
    currentUserId,
    currentUserIsAdministrator,
    feedType,
    hasRelatedPosts,
    hasHackerNewsReferences,
    includeDirectItems,
    itemCutoffId: cutoffDate ? itemCutoffId : null,
    cutoffDate,
    mediaTypes,
    minScoreFollowRssFeeds,
    minScoreFollowTopics,
    textSearchQuery,
    topicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    sourceLimit,
    pageSize,
    cursorSortAt,
    cursorId,
    cursorInclusive,
    storyItemLimit,
    eligibilityChildLimit,
    proxyFollowInputLimit,
  })
  appendDirectWinnerCTE(query, {
    communityId,
    currentUserId,
    feedType,
    storyItemLimit,
    eligibilityChildLimit,
    proxyFollowInputLimit,
    minScoreFollowRssFeeds,
    minScoreFollowTopics,
  })
  appendSharedFeedItemsCTE(query)
  return query.append(sql`
    ),
    combined_rss_feed_items AS (
      SELECT * FROM direct_rss_feed_items
      UNION ALL
      SELECT * FROM shared_rss_feed_items
    )`)
}

function appendSharedFeedItemsCTE(query: SQLStatement): void {
  query.append(sql`
    ),
    shared_rss_feed_items AS (
      SELECT
        eligible_rss_feed_items.item_id,
        rss_feed_item_feed_shares.id::text AS result_id,
        eligible_rss_feed_items.entity_id,
        eligible_rss_feed_items.votes_score_net,
        eligible_rss_feed_items.published_at,
        rss_feed_item_feed_shares.sort_at,
        eligible_rss_feed_items.story_id,
        'share'::text AS delivery_type,
        rss_feed_item_feed_shares.shared_by_id,
        rss_feed_item_feed_shares.created_at AS shared_at,
        false AS matches_source,
        false AS matches_topics
      FROM shared_item_pool rss_feed_item_feed_shares
      CROSS JOIN LATERAL (
        SELECT * FROM eligible_rss_feed_items
        WHERE item_id = rss_feed_item_feed_shares.rss_feed_item_id
        LIMIT 1
      ) eligible_rss_feed_items
      WHERE NOT EXISTS (
          SELECT 1 FROM excluded_users WHERE excluded_users.user_id = rss_feed_item_feed_shares.shared_by_id
        )
  `)
}
