import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedOptions } from '../../types.mts'
import { appendRssFeedItemEligibilityFilters } from './eligibility-filters.mts'

/** Shared deliveries are user-scoped; community feeds never include shares. */
export function appendEligibleRssFeedItemsCTE(
  query: SQLStatement,
  {
    currentUserId,
    currentUserIsAdministrator,
    hasRelatedPosts,
    hasHackerNewsReferences,
    mediaTypes,
    textSearchQuery,
    topicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    eligibilityChildLimit,
  }: {
    currentUserId?: string
    currentUserIsAdministrator: boolean
    hasRelatedPosts: boolean | undefined
    hasHackerNewsReferences?: boolean
    mediaTypes: string[]
    textSearchQuery: RssFeedItemFeedOptions['text_search_query']
    topicIds: RssFeedItemFeedOptions['topic_ids']
    hashtagTopicIds: RssFeedItemFeedOptions['hashtag_topic_ids']
    hashtagAliasIds: RssFeedItemFeedOptions['hashtag_alias_ids']
    hasUnknownHashtag: RssFeedItemFeedOptions['has_unknown_hashtag']
    eligibilityChildLimit: number
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
    hasHackerNewsReferences,
    mediaTypes,
    textSearchQuery,
    topicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    eligibilityChildLimit,
  })
  return query.append(sql`
    )`)
}
