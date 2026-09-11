import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'
import { appendPreFilterCondition } from './direct-candidate-prefilter.mts'
import { buildFollowedTopicCategoryCondition } from './followed-topic-category-condition.mts'
import { appendRssFeedItemEligibilityFilters } from './eligibility-filters.mts'

export function appendDirectCandidateCTE(
  query: SQLStatement,
  options: DirectCandidateFilterOptions,
): void {
  const { includeDirectItems, minScoreFollowRssFeeds, minScoreFollowTopics } = options
  if (!includeDirectItems) {
    query.append(sql`
    ,
    direct_candidate_rss_feed_items AS NOT MATERIALIZED (
      SELECT
        NULL::uuid AS item_id, NULL::text AS result_id, NULL::text AS entity_id, NULL::int AS votes_score_net,
        NULL::timestamptz AS published_at, NULL::timestamptz AS sort_at, NULL::uuid AS story_id, NULL::text AS delivery_type,
        NULL::uuid AS shared_by_user_id, NULL::timestamptz AS shared_at, NULL::int AS sort_rank,
        NULL::uuid AS share_event_id, NULL::boolean AS matches_source, NULL::boolean AS matches_topics
      WHERE false
  `)
    return
  }

  query.append(sql`
    ,
    direct_candidate_rss_feed_items AS NOT MATERIALIZED (
      SELECT
        rss_feed_items.id AS item_id,
        rss_feed_items.id::text AS result_id,
        rss_feed_items.id::text AS entity_id,
        rss_feed_items.votes_score_net,
        rss_feed_items.published_at,
        rss_feed_items.published_at AS sort_at,
        rss_feed_items.story_id,
        'direct'::text AS delivery_type,
        NULL::uuid AS shared_by_user_id,
        NULL::timestamptz AS shared_at,
        0::int AS sort_rank,
        NULL::uuid AS share_event_id,
        (
          rss_feed_items.votes_score_net >= ${minScoreFollowRssFeeds}
          AND EXISTS (
            SELECT 1 FROM rss_feed_item_sources rfis_match
            JOIN followed_rss_feeds ON followed_rss_feeds.rss_feed_id = rfis_match.rss_feed_id
            WHERE rfis_match.rss_feed_item_id = rss_feed_items.id
          )
        ) AS matches_source,
        (
          rss_feed_items.votes_score_net >= ${minScoreFollowTopics}
          AND `)
  query.append(buildFollowedTopicCategoryCondition(sql`rss_feed_items.id`))
  query.append(sql`
        ) AS matches_topics
      FROM rss_feed_items
      WHERE
  `)
  appendDirectCandidateFilters(query, options)
}

export type DirectCandidateFilterOptions = {
  currentUserId?: string
  currentUserIsAdministrator: boolean
  feedType: RssFeedItemFeedType | undefined
  hasRelatedPosts: boolean | undefined
  includeDirectItems: boolean
  itemCutoffId: string | null
  mediaTypes: string[]
  minScoreFollowRssFeeds: number
  minScoreFollowTopics: number
  textSearchQuery: string | undefined
  topicIds: string[] | undefined
  hashtagTopicIds: string[] | undefined
  hashtagAliasIds: string[] | undefined
  hasUnknownHashtag: boolean | undefined
}

export function appendDirectCandidateFilters(
  query: SQLStatement,
  {
    currentUserId,
    currentUserIsAdministrator,
    feedType,
    hasRelatedPosts,
    itemCutoffId,
    mediaTypes,
    minScoreFollowRssFeeds,
    minScoreFollowTopics,
    textSearchQuery,
    topicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
  }: DirectCandidateFilterOptions,
  {
    rssFeedItemId = sql`rss_feed_items.id`,
    rssFeedItemUrlId = sql`rss_feed_items.url_id`,
    rssFeedItemTable = sql`rss_feed_items`,
    rssFeedItemVotes = sql`rss_feed_items.votes_score_net`,
  }: {
    rssFeedItemId?: SQLStatement
    rssFeedItemUrlId?: SQLStatement
    rssFeedItemTable?: SQLStatement
    rssFeedItemVotes?: SQLStatement
  } = {},
): void {
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
    rssFeedItemId,
    rssFeedItemUrlId,
    rssFeedItemTable,
  })
  appendPreFilterCondition(
    query,
    feedType,
    minScoreFollowRssFeeds,
    minScoreFollowTopics,
    rssFeedItemId,
    rssFeedItemVotes,
  )
  if (itemCutoffId)
    query
      .append(sql` AND `)
      .append(rssFeedItemId)
      .append(sql` >= ${itemCutoffId}`)
}
