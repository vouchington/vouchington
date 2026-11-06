import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedOptions, RssFeedItemFeedType } from '../../types.mts'
import { appendRelationCTEs } from './relation-ctes.mts'
import { appendRssFeedItemEligibilityFilters } from './eligibility-filters.mts'
import { appendFollowMembershipFilter } from './follow-membership.mts'

export type FeedPageQueryOptions = {
  communityId?: string
  currentUserId?: string
  currentUserIsAdministrator: boolean
  feedType: RssFeedItemFeedType
  filters: RssFeedItemFeedOptions
  cutoffDate: Date
  itemCutoffId: string
  cursorSortAt?: string
  cursorId?: string
  safeLimit: number
  minScoreFollowRssFeeds: number
  minScoreFollowTopics: number
  includeDirectItems: boolean
  includeSharedItems: boolean
}

/** One statement: canonical item walk plus the recipient-indexed share delivery arm. */
export function buildRssFeedItemPageQuery(options: FeedPageQueryOptions): SQLStatement {
  const { cutoffDate, itemCutoffId, cursorSortAt, cursorId, safeLimit } = options
  const query = appendRelationCTEs(sql``, options)
  query.append(sql`, direct_deliveries AS NOT MATERIALIZED (
    SELECT rss_feed_items.id AS result_id,
      rss_feed_items.id AS entity_id,
      rss_feed_items.published_at, rss_feed_items.published_at AS sort_at,
      rss_feed_items.story_id, 'direct'::text AS delivery_type,
      NULL::uuid AS shared_by_id, NULL::timestamptz AS shared_at
    FROM rss_feed_items
    WHERE ${options.includeDirectItems}
      AND rss_feed_items.published_at >= ${cutoffDate}
      AND rss_feed_items.id >= ${itemCutoffId}::uuid`)
  if (cursorSortAt && cursorId)
    query.append(sql` AND (rss_feed_items.published_at, rss_feed_items.id)
      < (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`)
  query.append(sql` AND `)
  appendCandidatePredicate(query, sql`rss_feed_items`, options, true)
  query.append(sql` AND (rss_feed_items.story_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM rss_feed_items newer
    WHERE newer.story_id = rss_feed_items.story_id
      AND (newer.published_at, newer.id) > (rss_feed_items.published_at, rss_feed_items.id)
      AND newer.published_at >= ${cutoffDate} AND newer.id >= ${itemCutoffId}::uuid
      AND `)
  appendCandidatePredicate(query, sql`newer`, options, true)
  query.append(sql`
  ))
  ), shared_deliveries AS NOT MATERIALIZED (
    SELECT share.id AS result_id, rss_feed_items.id AS entity_id,
      rss_feed_items.published_at, share.sort_at, rss_feed_items.story_id,
      'share'::text AS delivery_type, share.shared_by_id,
      share.created_at AS shared_at
    FROM rss_feed_item_feed_shares share
    JOIN rss_feed_items ON rss_feed_items.id = share.rss_feed_item_id
    WHERE ${options.includeSharedItems}
      AND share.recipient_user_id = ${options.currentUserId ?? '00000000-0000-0000-0000-000000000000'}
      AND share.sort_at >= ${cutoffDate}
      AND rss_feed_items.published_at >= ${cutoffDate}
      AND rss_feed_items.id >= ${itemCutoffId}::uuid
      AND NOT EXISTS (SELECT 1 FROM excluded_users excluded
        WHERE excluded.user_id = share.shared_by_id)`)
  if (cursorSortAt && cursorId)
    query.append(sql` AND (share.sort_at, share.id)
      < (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`)
  query.append(sql` AND `)
  appendCandidatePredicate(query, sql`rss_feed_items`, options, false)
  query.append(sql`
  ), combined_deliveries AS NOT MATERIALIZED (
    SELECT * FROM direct_deliveries UNION ALL SELECT * FROM shared_deliveries
  )
  SELECT result_id, entity_id, published_at, story_id, delivery_type,
    shared_by_id, shared_at,
    to_char(sort_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_sort_at
  FROM combined_deliveries
  ORDER BY sort_at DESC, result_id DESC
  LIMIT ${safeLimit + 1}`)
  return query
}

function appendCandidatePredicate(
  query: SQLStatement,
  item: SQLStatement,
  options: FeedPageQueryOptions,
  requireFollow: boolean,
): void {
  query.append(sql`(`)
  appendRssFeedItemEligibilityFilters(query, {
    currentUserId: options.currentUserId,
    currentUserIsAdministrator: options.currentUserIsAdministrator,
    hasRelatedPosts: options.filters.has_related_posts,
    hasHackerNewsReferences: options.filters.has_hacker_news_references,
    mediaTypes: options.filters.media_types ?? [],
    textSearchQuery: options.filters.text_search_query,
    topicIds: options.filters.topic_ids,
    hashtagTopicIds: options.filters.hashtag_topic_ids,
    hashtagAliasIds: options.filters.hashtag_alias_ids,
    hasUnknownHashtag: options.filters.has_unknown_hashtag,
    rssFeedItemId: sql``.append(item).append(sql`.id`),
    rssFeedItemUrlId: sql``.append(item).append(sql`.url_id`),
    rssFeedItemTable: item,
  })
  if (requireFollow)
    appendFollowMembershipFilter(
      query,
      sql``.append(item).append(sql`.id`),
      sql``.append(item).append(sql`.votes_score_net`),
      options.feedType,
      options.minScoreFollowRssFeeds,
      options.minScoreFollowTopics,
    )
  query.append(sql`)`)
}
