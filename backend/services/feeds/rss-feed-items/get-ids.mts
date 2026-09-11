import type { PrivateUser } from '@services/users/types'
import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '../types.mts'
import sql from 'sql-template-strings'
import { read } from '@data-stores/psql'
import { clampLimit } from '@modules/search-utils'
import createHttpError from 'http-errors'
import {
  buildRssFeedItemFeedPageInfo,
  getCutoffDateForTimeRange,
  parseRssFeedItemFeedCursor,
} from './query-utils.mts'
import { appendRelationCTEs } from './get-ids/relation-ctes.mts'
import { appendEligibleRssFeedItemsCTE } from './get-ids/eligible-items-cte.mts'
import { appendDeliveryCTEs } from './get-ids/delivery-ctes.mts'
import { appendFinalSelectCTE, appendPaginationCTEs } from './get-ids/pagination-ctes.mts'

export async function getRssFeedItemFeedIds(
  currentUser: PrivateUser | null,
  options: RssFeedItemFeedOptions = {},
): Promise<RssFeedItemFeedResponse> {
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
  const { published_lt, item_id_lt, share_event_id_lt } = parseRssFeedItemFeedCursor(options.after)

  const includeDirectItems = feed_type !== 'follow_users'
  const includeSharedItems =
    !!currentUserId && !communityId && (feed_type === 'follow_users' || feed_type === 'any')
  const { cutoffDate, itemCutoffId } = getCutoffDateForTimeRange(time_range)

  const query = appendRelationCTEs(
    sql`/* getRssFeedItemFeedIds */
    WITH `,
    { communityId, currentUserId },
  )

  appendEligibleRssFeedItemsCTE(query, {
    communityId,
    currentUserId,
    currentUserIsAdministrator,
    feedType: feed_type,
    hasRelatedPosts: options.has_related_posts,
    mediaTypes: media_types,
    textSearchQuery: options.text_search_query,
    topicIds: options.topic_ids,
    hashtagTopicIds: options.hashtag_topic_ids,
    hashtagAliasIds: options.hashtag_alias_ids,
    hasUnknownHashtag: options.has_unknown_hashtag,
  })

  appendDeliveryCTEs(query, {
    cutoffDate,
    currentUserId,
    currentUserIsAdministrator,
    feedType: feed_type,
    hasRelatedPosts: options.has_related_posts,
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
  })
  appendPaginationCTEs(query, {
    directCandidateFilters: {
      currentUserId,
      currentUserIsAdministrator,
      feedType: feed_type,
      hasRelatedPosts: options.has_related_posts,
      includeDirectItems,
      itemCutoffId: cutoffDate ? itemCutoffId : null,
      mediaTypes: media_types,
      minScoreFollowRssFeeds: min_score_follow_rss_feeds,
      minScoreFollowTopics: min_score_follow_topics,
      textSearchQuery: options.text_search_query,
      topicIds: options.topic_ids,
      hashtagTopicIds: options.hashtag_topic_ids,
      hashtagAliasIds: options.hashtag_alias_ids,
      hasUnknownHashtag: options.has_unknown_hashtag,
    },
    itemIdLt: item_id_lt,
    publishedLt: published_lt,
    safeLimit,
    shareEventIdLt: share_event_id_lt,
  })
  appendFinalSelectCTE(query)

  const { rows } = await read(query)
  const hasNextPage = rows.some(row => row.has_next_page === true)

  const results = rows.map(row => ({
    __entity_type: 'rss_feed_item' as const,
    id: row.result_id as string,
    entity_id: row.entity_id as string,
    published_at: row.published_at as Date,
    story_id: (row.story_id as string | null) ?? null,
    delivery_type: row.delivery_type as 'direct' | 'share',
    ...(row.shared_by_user_id ? { shared_by_user_id: row.shared_by_user_id as string } : {}),
    ...(row.shared_at ? { shared_at: row.shared_at as Date } : {}),
  }))

  return {
    results,
    page_info: buildRssFeedItemFeedPageInfo(
      rows.map(row => ({
        result_id: row.result_id as string,
        sort_at: row.sort_at as Date | string | null,
        // Direct items tie-break by item_id; shares tie-break by share_event_id UUID.
        // Prefix "share:" on share cursors so the parser can distinguish delivery types.
        cursor_id:
          row.delivery_type === 'direct'
            ? (row.item_id as string)
            : `share:${row.result_id as string}`,
      })),
      hasNextPage,
    ),
  }
}
