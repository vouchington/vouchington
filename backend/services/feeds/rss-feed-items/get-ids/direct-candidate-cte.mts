import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedType } from '../../types.mts'
import { appendRssFeedItemEligibilityFilters } from './eligibility-filters.mts'
import { appendMatchedItemCTEs } from './matched-item-ctes.mts'

export function appendDirectCandidateCTE(
  query: SQLStatement,
  options: DirectCandidateFilterOptions,
): void {
  const { includeDirectItems, minScoreFollowRssFeeds, minScoreFollowTopics } = options
  if (!includeDirectItems) {
    query.append(sql`
    ,
    direct_candidate_rss_feed_items AS MATERIALIZED (
      SELECT
        NULL::uuid AS item_id, NULL::int AS votes_score_net,
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
      FROM rss_feed_items
      JOIN matched_direct_rss_feed_item_guids ON matched_direct_rss_feed_item_guids.item_id = rss_feed_items.id
      WHERE
  `)
  appendRssFeedItemEligibilityFilters(query, options)
  appendMembershipScoreFilter(query, options)
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

function appendMembershipScoreFilter(
  query: SQLStatement,
  { feedType, minScoreFollowRssFeeds, minScoreFollowTopics }: DirectCandidateFilterOptions,
): void {
  const source = sql`(matched_direct_rss_feed_item_guids.matches_source AND rss_feed_items.votes_score_net >= ${minScoreFollowRssFeeds})`
  const topics = sql`(matched_direct_rss_feed_item_guids.matches_topics AND rss_feed_items.votes_score_net >= ${minScoreFollowTopics})`
  query.append(sql` AND (`)
  if (feedType === 'follow_rss_feeds') query.append(source)
  else if (feedType === 'follow_topics') query.append(topics)
  else if (feedType === 'all')
    query
      .append(source)
      .append(sql` AND `)
      .append(topics)
  else
    query
      .append(source)
      .append(sql` OR `)
      .append(topics)
  query.append(sql`)`)
}
