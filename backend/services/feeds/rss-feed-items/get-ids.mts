import { clampLimit } from '@services/pagination'
import type { PrivateUser } from '@services/users/types'
import type { RssFeedItemFeedOptions, RssFeedItemFeedResponse } from '../types.mts'
import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import createHttpError from 'http-errors'
import {
  buildRssFeedItemFeedPageInfo,
  getRssFeedItemFeedCursorScope,
  parseRssFeedItemFeedCursor,
} from './cursor.mts'
import { getCutoffDateForTimeRange } from './query-utils.mts'
import { buildRssFeedItemPageQuery } from './get-ids/build-page-query.mts'

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
  if (!currentUserId && !communityId) throw createHttpError(401, 'Authentication required')

  const minScoreFollowRssFeeds = options.min_score_follow_rss_feeds ?? -5
  const minScoreFollowTopics = options.min_score_follow_topics ?? 0
  const safeLimit = clampLimit(limit)
  const cursorScope = getRssFeedItemFeedCursorScope(currentUserId, {
    ...options,
    feed_type,
    time_range,
    min_score_follow_rss_feeds: minScoreFollowRssFeeds,
    min_score_follow_topics: minScoreFollowTopics,
    isAdministrator: currentUserIsAdministrator,
  })
  const { sort_at_lt, id_lt } = parseRssFeedItemFeedCursor(options.after, cursorScope)
  const requestedCutoff = getCutoffDateForTimeRange(time_range, decisionInstant).cutoffDate
  const sevenDayCutoff = new Date(decisionInstant.getTime() - 7 * 24 * 60 * 60 * 1000)
  const cutoffDate =
    requestedCutoff && requestedCutoff > sevenDayCutoff ? requestedCutoff : sevenDayCutoff
  const itemCutoffId = getMinUUIDv7ForDate(cutoffDate)
  const includeDirectItems = feed_type !== 'follow_users'
  const includeSharedItems =
    !!currentUserId && !communityId && (feed_type === 'follow_users' || feed_type === 'any')

  const query = buildRssFeedItemPageQuery({
    communityId,
    currentUserId,
    currentUserIsAdministrator,
    feedType: feed_type,
    filters: options,
    cutoffDate,
    itemCutoffId,
    cursorSortAt: sort_at_lt,
    cursorId: id_lt,
    safeLimit,
    minScoreFollowRssFeeds,
    minScoreFollowTopics,
    includeDirectItems,
    includeSharedItems,
  })
  const { rows } = await read(`/* getRssFeedItemFeedIds */ WITH ${query.text}`, query.values)
  const hasNextPage = rows.length > safeLimit
  const pageRows = rows.slice(0, safeLimit)
  return {
    results: pageRows.map(row => ({
      __entity_type: 'rss_feed_item' as const,
      id: row.result_id as string,
      entity_id: row.entity_id as string,
      published_at: row.published_at as Date,
      story_id: (row.story_id as string | null) ?? null,
      delivery_type: row.delivery_type as 'direct' | 'share',
      ...(row.shared_by_id ? { shared_by_id: row.shared_by_id as string } : {}),
      ...(row.shared_at ? { shared_at: row.shared_at as Date } : {}),
    })),
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
