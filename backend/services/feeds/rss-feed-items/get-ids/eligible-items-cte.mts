import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedOptions } from '../../types.mts'
import { appendRssFeedItemEligibilityFilters } from './eligibility-filters.mts'

export function appendEligibleRssFeedItemsCTE(
  query: SQLStatement,
  {
    communityId,
    currentUserId,
    currentUserIsAdministrator,
    feedType,
    hasRelatedPosts,
    mediaTypes,
    textSearchQuery,
    topicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
  }: {
    communityId?: string
    currentUserId?: string
    currentUserIsAdministrator: boolean
    feedType: RssFeedItemFeedOptions['feed_type']
    hasRelatedPosts: boolean | undefined
    mediaTypes: string[]
    textSearchQuery: RssFeedItemFeedOptions['text_search_query']
    topicIds: RssFeedItemFeedOptions['topic_ids']
    hashtagTopicIds: RssFeedItemFeedOptions['hashtag_topic_ids']
    hashtagAliasIds: RssFeedItemFeedOptions['hashtag_alias_ids']
    hasUnknownHashtag: RssFeedItemFeedOptions['has_unknown_hashtag']
  },
): SQLStatement {
  query.append(sql`,
    eligible_rss_feed_items AS NOT MATERIALIZED (
      SELECT
        rss_feed_items.id AS item_id,
        rss_feed_items.id::text AS entity_id,
        rss_feed_items.votes_score_net,
        rss_feed_items.published_at,
        rss_feed_items.story_id
      FROM rss_feed_items
      WHERE
  `)
  appendRssFeedItemEligibilityFilters(query, {
    currentUserId,
    currentUserIsAdministrator,
    hasRelatedPosts,
    mediaTypes,
    textSearchQuery,
    topicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
  })

  appendCommunityScopeFilter(query, communityId, feedType)
  return query.append(sql`
    )`)
}

function appendCommunityScopeFilter(
  query: SQLStatement,
  communityId: string | undefined,
  feedType: RssFeedItemFeedOptions['feed_type'],
): void {
  if (!communityId) return
  const sourceFilter = buildCommunityScopeSourceFilter()
  const topicFilter = buildCommunityScopeTopicFilter()
  if (feedType === 'follow_rss_feeds') query.append(sql` AND `).append(sourceFilter)
  else if (feedType === 'follow_topics') query.append(sql` AND `).append(topicFilter)
  else if (feedType === 'all')
    query
      .append(sql` AND `)
      .append(sourceFilter)
      .append(sql` AND `)
      .append(topicFilter)
  else if (feedType === 'any') {
    query
      .append(sql`
        AND (
          `)
      .append(sourceFilter)
      .append(sql`
          OR `)
      .append(topicFilter).append(sql`
        )
      `)
  }
}

function buildCommunityScopeSourceFilter(): SQLStatement {
  return sql`EXISTS (
    SELECT 1
    FROM rss_feed_item_sources scope_rfis
    JOIN followed_rss_feeds
      ON followed_rss_feeds.rss_feed_id = scope_rfis.rss_feed_id
    WHERE scope_rfis.rss_feed_item_id = rss_feed_items.id
  )`
}

function buildCommunityScopeTopicFilter(): SQLStatement {
  return sql`(
    EXISTS (
      SELECT 1
      FROM rss_feed_item_categories scope_categories
      JOIN followed_topics
        ON followed_topics.topic_id = scope_categories.topic_id
      WHERE scope_categories.rss_feed_item_id = rss_feed_items.id
    )
    OR EXISTS (
      SELECT 1
      FROM relation__rss_feed_item__category__topic scope_topic_relation
      JOIN followed_topics
        ON followed_topics.topic_id = scope_topic_relation.object_id
      WHERE scope_topic_relation.subject_id = rss_feed_items.id
        AND scope_topic_relation.deleted_at IS NULL
        AND scope_topic_relation.votes_score_net > 0
    )
  )`
}
