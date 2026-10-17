import { clampLimit } from '@services/pagination'
import { read } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'

import { buildPageInfo, decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import type { TrendingRssFeedsOptions, TrendingRssFeedsResult } from './types.mts'

const DEFAULT_LIMIT = 20

const TIME_RANGES = new Set(['day', 'week', 'month'])

export async function getTrendingRssFeeds(
  options: TrendingRssFeedsOptions,
): Promise<TrendingRssFeedsResult> {
  const { timeRange, minScore, limit, after } = options

  if (!TIME_RANGES.has(timeRange)) {
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
    SELECT id, trending_score, follow_count, item_count
    FROM mv_trending_rss_feeds
    WHERE window_name = ${timeRange}`

  if (minScore !== undefined) {
    query.append(sql`
        AND trending_score >= ${minScore}`)
  }

  if (cursorScore !== undefined && cursorId !== undefined) {
    query.append(sql`
        AND (trending_score, id) < (${cursorScore}, ${cursorId})`)
  }

  query.append(sql`
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
