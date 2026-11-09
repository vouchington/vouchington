import { clampLimit } from '@services/pagination'
import { read } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { TRENDING_TOPICS_DEFAULT_LIMIT } from '@modules/search-utils'
import { decodeUuidCursor, encodeCursor, isScoreCursor } from '@modules/pagination'
import type { TrendingTopicMetric, TrendingTopicsOptions, TrendingTopicsResult } from './types.mts'

const TIME_RANGES: ReadonlySet<string> = new Set(['day', 'week', 'month'])

/** Top topics of mv_trending_topics, which may lag one refresh; topic eligibility is read live. */
export async function getTrendingTopics(
  options: TrendingTopicsOptions,
): Promise<TrendingTopicsResult> {
  const { timeRange, minScore, limit, after } = options

  if (!TIME_RANGES.has(timeRange)) {
    throw createHttpError(400, 'Invalid time_range')
  }

  const safeLimit = Math.floor(clampLimit(limit, TRENDING_TOPICS_DEFAULT_LIMIT))

  // Parse cursor if provided
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

  const query = sql`/* getTrendingTopics */
    SELECT trending.id, trending.trending_score, trending.post_tag_count, trending.rss_item_tag_count
    FROM mv_trending_topics trending
    JOIN topics t ON t.id = trending.id
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
    WHERE trending.window_name = ${timeRange}`

  if (minScore !== undefined) {
    query.append(sql`
      AND trending.trending_score >= ${minScore}`)
  }

  if (cursorScore !== undefined && cursorId !== undefined) {
    query.append(sql`
      AND (trending.trending_score, trending.id) < (${cursorScore}, ${cursorId})`)
  }

  query.append(sql`
    ORDER BY trending.trending_score DESC, trending.id DESC
    LIMIT ${safeLimit + 1}`)

  const { rows } = await read<TrendingTopicMetric>(query)

  // Check if there are more results than requested
  const hasNextPage = rows.length > safeLimit

  // Build results array without using array methods after query
  const results: TrendingTopicsResult['results'] = []
  for (let i = 0; i < safeLimit && i < rows.length; i++) {
    results.push(rows[i])
  }

  let endCursor: string | null = null
  if (hasNextPage && results.length > 0) {
    const lastItem = results.at(-1)!
    endCursor = encodeCursor({ score: lastItem.trending_score, id: lastItem.id })
  }

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: endCursor,
      start_cursor:
        results.length > 0
          ? encodeCursor({ score: results[0].trending_score, id: results[0].id })
          : null,
    },
  }
}
