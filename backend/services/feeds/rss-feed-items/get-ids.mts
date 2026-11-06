import { clampLimit } from '@services/pagination'
import type { PrivateUser } from '@services/users/types'
import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '../types.mts'
import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'

import createHttpError from 'http-errors'
import {
  buildRssFeedItemFeedPageInfo,
  getRssFeedItemFeedCursorScope,
  parseRssFeedItemFeedCursor,
} from './cursor.mts'
import { getCutoffDateForTimeRange } from './query-utils.mts'
import { appendRelationCTEs } from './get-ids/relation-ctes.mts'
import { appendEligibleRssFeedItemsCTE } from './get-ids/eligible-items-cte.mts'
import { appendDeliveryCTEs } from './get-ids/delivery-ctes.mts'
import { appendFeedPageSelect } from './get-ids/page-select.mts'
import { getRssFeedItemPageLimit } from './feed-page-config.mts'
import { getRelationTypeLimit } from '@services/entity-relations/relation-limits-config'

export async function getRssFeedItemFeedIds(
  currentUser: PrivateUser | null,
  options: RssFeedItemFeedOptions = {},
  asOf: Date = new Date(),
): Promise<RssFeedItemFeedResponse> {
  const decisionInstant = new Date(asOf)
  if (!Number.isFinite(decisionInstant.getTime()))
    throw new RangeError('Invalid feed decision instant')
  const { feed_type = 'any', limit, time_range = '1w' } = options
  const communityId = options.community_id
  const currentUserId = currentUser?.id
  const currentUserIsAdministrator = currentUser?.roles.includes('administrator') ?? false
  if (!currentUserId && !communityId) {
    throw createHttpError(401, 'Authentication required')
  }
  const media_types = options.media_types ?? []

  const DEFAULT_MIN_SCORE_FOLLOW_RSS_FEEDS = -5
  const DEFAULT_MIN_SCORE_FOLLOW_TOPICS = 0

  const min_score_follow_rss_feeds =
    options.min_score_follow_rss_feeds ?? DEFAULT_MIN_SCORE_FOLLOW_RSS_FEEDS
  const min_score_follow_topics = options.min_score_follow_topics ?? DEFAULT_MIN_SCORE_FOLLOW_TOPICS
  const safeLimit = clampLimit(limit)
  const pageLimits = {
    source_limit: getRssFeedItemPageLimit('source_limit'),
    story_item_limit: getRssFeedItemPageLimit('story_item_limit'),
    eligibility_child_limit: getRssFeedItemPageLimit('eligibility_child_limit'),
    exclusion_relation_limit: getRssFeedItemPageLimit('exclusion_relation_limit'),
  }
  const cursorScope = getRssFeedItemFeedCursorScope(
    currentUserId,
    {
      ...options,
      feed_type,
      time_range,
      min_score_follow_rss_feeds,
      min_score_follow_topics,
      isAdministrator: currentUserIsAdministrator,
    },
    pageLimits,
  )
  const { sort_at_lt, id_lt } = parseRssFeedItemFeedCursor(options.after, cursorScope)

  const includeDirectItems = feed_type !== 'follow_users'
  const includeSharedItems =
    !!currentUserId && !communityId && (feed_type === 'follow_users' || feed_type === 'any')
  const { cutoffDate, itemCutoffId } = getCutoffDateForTimeRange(time_range, decisionInstant)
  const sourceLimit = pageLimits.source_limit
  const followInputLimit = Math.max(
    getRelationTypeLimit('relation__user__follow__rss_feed') ?? 10_000,
    getRelationTypeLimit('relation__user__follow__topic') ?? 10_000,
  )

  const query = appendRelationCTEs(sql``, {
    communityId,
    currentUserId,
    sourceLimit,
    followInputLimit,
    exclusionRelationLimit: pageLimits.exclusion_relation_limit,
    cursorSortAt: sort_at_lt,
    cursorId: id_lt,
  })

  appendEligibleRssFeedItemsCTE(query, {
    currentUserId,
    currentUserIsAdministrator,
    hasRelatedPosts: options.has_related_posts,
    hasHackerNewsReferences: options.has_hacker_news_references,
    mediaTypes: media_types,
    textSearchQuery: options.text_search_query,
    topicIds: options.topic_ids,
    hashtagTopicIds: options.hashtag_topic_ids,
    hashtagAliasIds: options.hashtag_alias_ids,
    hasUnknownHashtag: options.has_unknown_hashtag,
    eligibilityChildLimit: pageLimits.eligibility_child_limit,
  })

  appendDeliveryCTEs(query, {
    communityId,
    cutoffDate,
    currentUserId,
    currentUserIsAdministrator,
    feedType: feed_type,
    hasRelatedPosts: options.has_related_posts,
    hasHackerNewsReferences: options.has_hacker_news_references,
    includeDirectItems,
    includeSharedItems,
    itemCutoffId,
    mediaTypes: media_types,
    minScoreFollowRssFeeds: min_score_follow_rss_feeds,
    minScoreFollowTopics: min_score_follow_topics,
    textSearchQuery: options.text_search_query,
    topicIds: options.topic_ids,
    hashtagTopicIds: options.hashtag_topic_ids,
    hashtagAliasIds: options.hashtag_alias_ids,
    hasUnknownHashtag: options.has_unknown_hashtag,
    sourceLimit,
    pageSize: safeLimit,
    storyItemLimit: pageLimits.story_item_limit,
    eligibilityChildLimit: pageLimits.eligibility_child_limit,
    cursorSortAt: sort_at_lt,
    cursorId: id_lt,
  })
  appendFeedPageSelect(query, {
    idLt: id_lt,
    sortAtLt: sort_at_lt,
    safeLimit,
  })

  const { rows } = await read(
    `/* getRssFeedItemFeedIds */
    WITH ${query.text}`,
    query.values,
  )
  const hasNextPage =
    rows.length > safeLimit ||
    (rows.length > 0 &&
      (rows[0].has_omitted_source === true || rows[0].has_saturated_child_pool === true))
  const pageRows = rows.slice(0, safeLimit)

  const results = pageRows.map(row => ({
    __entity_type: 'rss_feed_item' as const,
    id: row.result_id as string,
    entity_id: row.entity_id as string,
    published_at: row.published_at as Date,
    story_id: (row.story_id as string | null) ?? null,
    delivery_type: row.delivery_type as 'direct' | 'share',
    ...(row.shared_by_id ? { shared_by_id: row.shared_by_id as string } : {}),
    ...(row.shared_at ? { shared_at: row.shared_at as Date } : {}),
  }))

  return {
    results,
    page_info: buildRssFeedItemFeedPageInfo(
      pageRows.map(row => ({
        cursor_sort_at: row.cursor_sort_at as string,
        cursor_id: row.result_id as string,
      })),
      hasNextPage,
      cursorScope,
    ),
  }
}
