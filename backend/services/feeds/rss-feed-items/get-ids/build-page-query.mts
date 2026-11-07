import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedOptions, RssFeedItemFeedType } from '../../types.mts'
import { appendPersonalizedExclusionCTEs } from './personalized-exclusions.mts'
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
  const query = appendPersonalizedExclusionCTEs(sql``, options.currentUserId, options.communityId)
  query.append(sql`, eligible_direct_items AS MATERIALIZED (
    SELECT feed_item.id AS result_id,
      feed_item.id AS entity_id,
      feed_item.published_at, feed_item.published_at AS sort_at,
      feed_item.story_id, 'direct'::text AS delivery_type,
      NULL::uuid AS shared_by_id, NULL::timestamptz AS shared_at
    FROM rss_feed_items feed_item
    WHERE ${options.includeDirectItems}
      AND feed_item.published_at >= ${cutoffDate}
      AND feed_item.id >= ${itemCutoffId}::uuid`)
  if (cursorSortAt && cursorId)
    query.append(sql` AND (feed_item.published_at, feed_item.id)
      < (${cursorSortAt}::timestamptz, ${cursorId}::uuid)`)
  query.append(sql` AND `)
  appendCandidatePredicate(query, sql`feed_item`, options, true)
  // Resolve each represented story over the full horizon, independently of the delivery cursor.
  query.append(sql`
  ), story_winners AS MATERIALIZED (
    SELECT story_keys.story_id, selected.id AS item_id
    FROM (SELECT DISTINCT story_id FROM eligible_direct_items
      WHERE story_id IS NOT NULL) story_keys
    CROSS JOIN LATERAL (
      SELECT feed_story_member.id FROM rss_feed_items feed_story_member
      WHERE feed_story_member.story_id = story_keys.story_id
        AND feed_story_member.published_at >= ${cutoffDate}
        AND feed_story_member.id >= ${itemCutoffId}::uuid
        AND `)
  appendCandidatePredicate(query, sql`feed_story_member`, options, true)
  query.append(sql`
      ORDER BY feed_story_member.published_at DESC, feed_story_member.id DESC LIMIT 1
    ) selected
  ), direct_deliveries AS NOT MATERIALIZED (
    SELECT eligible.* FROM eligible_direct_items eligible
    LEFT JOIN story_winners winner ON winner.story_id = eligible.story_id
    WHERE eligible.story_id IS NULL OR eligible.entity_id = winner.item_id
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
