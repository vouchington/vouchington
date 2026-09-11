import { read } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { clampLimit } from '@modules/search-utils'
import { buildPageInfo, decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import type { TrendingRssFeedsOptions, TrendingRssFeedsResult } from './types.mts'

const DEFAULT_LIMIT = 20

const TIME_RANGE_DAYS = {
  day: 1,
  week: 7,
  month: 30,
} as const

export async function getTrendingRssFeeds(
  options: TrendingRssFeedsOptions,
): Promise<TrendingRssFeedsResult> {
  const { timeRange, minScore, limit, after } = options

  const days = TIME_RANGE_DAYS[timeRange]
  if (days === undefined) {
    throw createHttpError(400, 'Invalid time_range')
  }

  const safeLimit = Math.floor(clampLimit(limit, DEFAULT_LIMIT))

  let cursorScore: number | undefined
  let cursorId: string | undefined
  if (after) {
    const cursor = decodeUuidCursor(
      after,
      isScoreCursor,
      'Invalid cursor format: expected score cursor',
    )
    cursorScore = cursor.score
    cursorId = cursor.id
  }

  const query = sql`/* getTrendingRssFeeds */
    WITH recent_follows AS (
      SELECT
        object_id AS feed_id,
        COUNT(*)::DOUBLE PRECISION AS follow_score,
        COUNT(*)::INT AS follow_count
      FROM relation__user__follow__rss_feed
      WHERE deleted_at IS NULL
        AND created_at > NOW() - ${days} * INTERVAL '1 day'
      GROUP BY object_id
    ),
    recent_items AS (
      SELECT
        rfis.rss_feed_id AS feed_id,
        COUNT(*)::DOUBLE PRECISION AS item_score,
        COUNT(*)::INT AS item_count
      FROM rss_feed_items rfi
      INNER JOIN rss_feed_item_sources rfis ON rfis.rss_feed_item_id = rfi.id
      WHERE rfi.deleted_at IS NULL
        AND rfi.published_at > NOW() - ${days} * INTERVAL '1 day'
      GROUP BY rfis.rss_feed_id
    ),
    combined AS (
      SELECT
        rf.id,
        (COALESCE(fl.follow_score, 0) * 3.0 + COALESCE(ri.item_score, 0))::DOUBLE PRECISION AS trending_score,
        COALESCE(fl.follow_count, 0)::INT AS follow_count,
        COALESCE(ri.item_count, 0)::INT AS item_count
      FROM rss_feeds rf
      JOIN view_rss_feed_current_states current_state
        ON current_state.rss_feed_id = rf.id
      LEFT JOIN recent_follows fl ON rf.id = fl.feed_id
      LEFT JOIN recent_items ri ON rf.id = ri.feed_id
      WHERE rf.deleted_at IS NULL
        AND current_state.is_enabled = TRUE
        AND current_state.is_discoverable = TRUE
        AND (fl.follow_score > 0 OR ri.item_score > 0)`

  if (minScore !== undefined) {
    query.append(sql`
        AND (COALESCE(fl.follow_score, 0) * 3.0 + COALESCE(ri.item_score, 0)) >= ${minScore}`)
  }

  if (cursorScore !== undefined && cursorId !== undefined) {
    query.append(sql`
        AND (COALESCE(fl.follow_score, 0) * 3.0 + COALESCE(ri.item_score, 0), rf.id) < (${cursorScore}, ${cursorId})`)
  }

  query.append(sql`
    )
    SELECT id, trending_score, follow_count, item_count
    FROM combined
    ORDER BY trending_score DESC, id DESC
    LIMIT ${safeLimit + 1}
  `)

  const { rows } = await read(query)

  const hasNextPage = rows.length > safeLimit
  const results = rows.slice(0, safeLimit) as TrendingRssFeedsResult['results']

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: item => ({ score: item.trending_score, id: item.id }),
    }),
  }
}
