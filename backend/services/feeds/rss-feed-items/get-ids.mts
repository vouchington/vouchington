import { clampLimit } from '@services/pagination'
import type { PrivateUser } from '@services/users/types'
import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '../types.mts'
import { read } from '@data-stores/psql'

import createHttpError from 'http-errors'
import {
  buildRssFeedItemFeedPageInfo,
  getRssFeedItemFeedCursorScope,
  parseRssFeedItemFeedCursor,
} from './cursor.mts'
import { getCutoffDateForTimeRange } from './query-utils.mts'
import { buildRssFeedItemPageQuery } from './get-ids/build-page-query.mts'
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
    proxy_follow_input_limit: getRssFeedItemPageLimit('proxy_follow_input_limit'),
    community_list_input_limit: getRssFeedItemPageLimit('community_list_input_limit'),
    story_item_limit: getRssFeedItemPageLimit('story_item_limit'),
    eligibility_child_limit: getRssFeedItemPageLimit('eligibility_child_limit'),
    exclusion_relation_limit: getRssFeedItemPageLimit('exclusion_relation_limit'),
    max_windows_per_page: getRssFeedItemPageLimit('max_windows_per_page'),
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

  let windowFloorSortAt: string | undefined
  let windowFloorId: string | undefined
  let includeWindowFloor = false
  for (let windowIndex = 0; windowIndex < pageLimits.max_windows_per_page; windowIndex++) {
    const cursorSortAt = windowFloorSortAt ?? sort_at_lt
    const cursorId = windowFloorId ?? id_lt
    const cursorInclusive = windowFloorSortAt !== undefined && includeWindowFloor
    const query = buildRssFeedItemPageQuery({
      communityId,
      currentUserId,
      currentUserIsAdministrator,
      sourceLimit,
      followInputLimit,
      proxyFollowInputLimit: pageLimits.proxy_follow_input_limit,
      communityListInputLimit: pageLimits.community_list_input_limit,
      cutoffDate,
      itemCutoffId,
      exclusionRelationLimit: pageLimits.exclusion_relation_limit,
      cursorSortAt,
      cursorId,
      cursorInclusive,
      clientCursorSortAt: sort_at_lt,
      clientCursorId: id_lt,
      safeLimit,
      hasRelatedPosts: options.has_related_posts,
      hasHackerNewsReferences: options.has_hacker_news_references,
      mediaTypes: media_types,
      textSearchQuery: options.text_search_query,
      topicIds: options.topic_ids,
      hashtagTopicIds: options.hashtag_topic_ids,
      hashtagAliasIds: options.hashtag_alias_ids,
      hasUnknownHashtag: options.has_unknown_hashtag,
      eligibilityChildLimit: pageLimits.eligibility_child_limit,
      feedType: feed_type,
      includeDirectItems,
      includeSharedItems,
      minScoreFollowRssFeeds: min_score_follow_rss_feeds,
      minScoreFollowTopics: min_score_follow_topics,
      pageSize: safeLimit,
      storyItemLimit: pageLimits.story_item_limit,
    })

    // oxlint-disable no-await-in-loop -- each bounded window supplies the next raw floor.
    // no-mistakes-disable-next-line query-reached-per-item: at most max_windows_per_page SQL windows, each page+1; the next raw floor depends on the preceding window.
    const { rows } = await read(
      `/* getRssFeedItemFeedIds */
    WITH ${query.text}`,
      query.values,
    )
    // oxlint-enable no-await-in-loop
    const deliveryRows = rows.filter(row => row.result_id !== null)
    const metadata = rows[0]
    if (
      deliveryRows.length === 0 &&
      metadata?.window_floor_sort_at &&
      metadata.window_floor_id &&
      windowIndex + 1 < pageLimits.max_windows_per_page
    ) {
      windowFloorSortAt = metadata.window_floor_sort_at as string
      windowFloorId = metadata.window_floor_id as string
      includeWindowFloor = metadata.window_floor_seen !== true
      continue
    }
    const hasNextPage =
      deliveryRows.length > safeLimit ||
      (deliveryRows.length > 0 &&
        (metadata?.has_omitted_source === true || metadata?.has_saturated_child_pool === true))
    const pageRows = deliveryRows.slice(0, safeLimit)

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
  throw new Error('RSS feed page window limit must be positive')
}
