import sql, { type SQLStatement } from 'sql-template-strings'
import { buildFeedTypeCondition } from '../../sql-builders/index.mts'
import type { RssFeedItemFeedOptions } from '../../types.mts'
import { appendDirectCandidateCTE } from './direct-candidate-cte.mts'

export function appendDeliveryCTEs(
  query: SQLStatement,
  {
    cutoffDate,
    currentUserId,
    currentUserIsAdministrator,
    feedType,
    hasRelatedPosts,
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
  }: {
    cutoffDate: Date | null
    currentUserId?: string
    currentUserIsAdministrator: boolean
    feedType: RssFeedItemFeedOptions['feed_type']
    hasRelatedPosts: boolean | undefined
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
  },
): SQLStatement {
  appendDirectCandidateCTE(query, {
    currentUserId,
    currentUserIsAdministrator,
    feedType,
    hasRelatedPosts,
    includeDirectItems,
    itemCutoffId: cutoffDate ? itemCutoffId : null,
    mediaTypes,
    minScoreFollowRssFeeds,
    minScoreFollowTopics,
    textSearchQuery,
    topicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
  })
  appendDirectFeedItemsCTE(query, { feedType, minScoreFollowRssFeeds, minScoreFollowTopics })
  appendSharedFeedItemsCTE(query, { cutoffDate, currentUserId, includeSharedItems })
  return query.append(sql`
    ),
    combined_rss_feed_items AS (
      SELECT * FROM direct_rss_feed_items
      UNION ALL
      SELECT * FROM shared_rss_feed_items
    )`)
}

function appendDirectFeedItemsCTE(
  query: SQLStatement,
  {
    feedType,
    minScoreFollowRssFeeds,
    minScoreFollowTopics,
  }: {
    feedType: RssFeedItemFeedOptions['feed_type']
    minScoreFollowRssFeeds: number
    minScoreFollowTopics: number
  },
): void {
  query.append(sql`
    ),
    direct_rss_feed_items AS NOT MATERIALIZED (
      SELECT direct_candidate_rss_feed_items.*
      FROM direct_candidate_rss_feed_items
      WHERE 1 = 1
  `)
  query.append(
    buildFeedTypeCondition(feedType ?? 'all', {
      sourceType: 'rss_feeds',
      scoreColumn: 'direct_candidate_rss_feed_items.votes_score_net',
      followedCTEAlias: 'followed_rss_feeds',
      followedCTEColumn: 'rss_feed_id',
      topicsConditions: [],
      minScoreSource: minScoreFollowRssFeeds,
      minScoreTopics: minScoreFollowTopics,
      sourceMatchColumn: 'direct_candidate_rss_feed_items.matches_source',
      topicsMatchColumn: 'direct_candidate_rss_feed_items.matches_topics',
    }),
  )
}

function appendSharedFeedItemsCTE(
  query: SQLStatement,
  {
    cutoffDate,
    currentUserId,
    includeSharedItems,
  }: {
    cutoffDate: Date | null
    currentUserId?: string
    includeSharedItems: boolean
  },
): void {
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
        rss_feed_item_feed_shares.shared_by_user_id,
        rss_feed_item_feed_shares.created_at AS shared_at,
        1::int AS sort_rank,
        rss_feed_item_feed_shares.id AS share_event_id,
        false AS matches_source,
        false AS matches_topics
      FROM rss_feed_item_feed_shares
      JOIN eligible_rss_feed_items
        ON eligible_rss_feed_items.item_id = rss_feed_item_feed_shares.rss_feed_item_id
      WHERE rss_feed_item_feed_shares.recipient_user_id = ${currentUserId ?? '00000000-0000-0000-0000-000000000000'}
        AND ${includeSharedItems}
        AND NOT EXISTS (
          SELECT 1 FROM excluded_users WHERE excluded_users.user_id = rss_feed_item_feed_shares.shared_by_user_id
        )
  `)
  if (cutoffDate) query.append(sql` AND rss_feed_item_feed_shares.sort_at >= ${cutoffDate}`)
}
