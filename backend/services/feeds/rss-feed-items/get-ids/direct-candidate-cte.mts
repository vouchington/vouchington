import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'
import { appendRssFeedItemEligibilityFilters } from './eligibility-filters.mts'
import { appendMatchedItemCTEs } from './matched-item-ctes.mts'
import { buildStableStoryMatch } from './story-follow-match.mts'

export function appendDirectCandidateCTE(
  query: SQLStatement,
  options: DirectCandidateFilterOptions,
): void {
  const { includeDirectItems, minScoreFollowRssFeeds, minScoreFollowTopics } = options
  if (!includeDirectItems) {
    query.append(sql`
    ,
    omitted_direct_source AS MATERIALIZED (
      SELECT NULL::timestamptz AS sort_at, NULL::uuid AS item_id WHERE FALSE
    ),
    source_item_pool AS MATERIALIZED (
      SELECT NULL::uuid AS source_id, NULL::uuid AS item_id,
        NULL::timestamptz AS sort_at WHERE FALSE
    ),
    topic_item_pool AS MATERIALIZED (
      SELECT NULL::uuid AS source_id, NULL::uuid AS item_id,
        NULL::timestamptz AS sort_at WHERE FALSE
    ),
    saturated_direct_child_boundaries AS MATERIALIZED (
      SELECT NULL::timestamptz AS sort_at, NULL::uuid AS item_id WHERE FALSE
    ),
    page_visibility_boundaries AS MATERIALIZED (
      SELECT sort_at, item_id FROM saturated_shared_child_boundary
    ),
    direct_candidate_rss_feed_items AS MATERIALIZED (
      SELECT
        NULL::uuid AS item_id, NULL::double precision AS votes_score_net,
        NULL::timestamptz AS published_at, NULL::uuid AS story_id,
        NULL::boolean AS matches_source, NULL::boolean AS matches_topics
      WHERE false
  `)
    return
  }

  appendMatchedItemCTEs(query, options)
  query.append(sql`
    ,
    direct_candidate_rss_feed_items AS MATERIALIZED (
      SELECT
        rss_feed_items.id AS item_id,
        rss_feed_items.votes_score_net,
        rss_feed_items.published_at,
        rss_feed_items.story_id,
        (
          rss_feed_items.votes_score_net >= ${minScoreFollowRssFeeds}
          AND matched_direct_rss_feed_item_guids.matches_source
        ) AS matches_source,
        (
          rss_feed_items.votes_score_net >= ${minScoreFollowTopics}
          AND matched_direct_rss_feed_item_guids.matches_topics
        ) AS matches_topics
      FROM matched_direct_rss_feed_item_guids
      CROSS JOIN LATERAL (
        SELECT rss_feed_items.id, rss_feed_items.votes_score_net,
          rss_feed_items.published_at, rss_feed_items.story_id
        FROM rss_feed_items
        WHERE rss_feed_items.id = matched_direct_rss_feed_item_guids.item_id
  `)
  if (options.cutoffDate)
    query.append(sql` AND rss_feed_items.published_at >= ${options.cutoffDate}`)
  query.append(sql` AND `)
  appendRssFeedItemEligibilityFilters(query, options)
  appendMembershipScoreFilter(query, options)
  query.append(sql`
        LIMIT 1
      ) rss_feed_items`)
}

export type DirectCandidateFilterOptions = {
  communityId?: string
  currentUserId?: string
  currentUserIsAdministrator: boolean
  feedType: RssFeedItemFeedType | undefined
  hasRelatedPosts: boolean | undefined
  hasHackerNewsReferences?: boolean
  includeDirectItems: boolean
  itemCutoffId: string | null
  cutoffDate: Date | null
  sourceLimit: number
  pageSize: number
  cursorSortAt?: string
  cursorId?: string
  cursorInclusive?: boolean
  storyItemLimit: number
  proxyFollowInputLimit: number
  eligibilityChildLimit: number
  mediaTypes: string[]
  minScoreFollowRssFeeds: number
  minScoreFollowTopics: number
  textSearchQuery: string | undefined
  topicIds: string[] | undefined
  hashtagTopicIds: string[] | undefined
  hashtagAliasIds: string[] | undefined
  hasUnknownHashtag: boolean | undefined
}

function appendMembershipScoreFilter(
  query: SQLStatement,
  options: DirectCandidateFilterOptions,
): void {
  const { feedType, minScoreFollowRssFeeds, minScoreFollowTopics } = options
  if (feedType === 'all') {
    query.append(sql` AND `)
    query.append(
      buildStableStoryMatch(sql`rss_feed_items.id`, sql`rss_feed_items.votes_score_net`, options),
    )
    return
  }
  const source = sql`(matched_direct_rss_feed_item_guids.matches_source AND rss_feed_items.votes_score_net >= ${minScoreFollowRssFeeds})`
  const topics = sql`(matched_direct_rss_feed_item_guids.matches_topics AND rss_feed_items.votes_score_net >= ${minScoreFollowTopics})`
  query.append(sql` AND (`)
  if (feedType === 'follow_rss_feeds') query.append(source)
  else if (feedType === 'follow_topics') query.append(topics)
  else
    query
      .append(source)
      .append(sql` OR `)
      .append(topics)
  query.append(sql`)`)
}
