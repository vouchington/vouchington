import { read } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { clampLimit, TRENDING_TOPICS_DEFAULT_LIMIT } from '@modules/search-utils'
import { decodeUuidCursor, encodeCursor, isScoreCursor } from '@modules/pagination'
import {
  getEntityRelationTableNameOrThrow,
  POST_TOPIC_CATEGORY_RELATION_TABLE,
} from '@services/entity-relations/metadata'
import { timestampToUuidv7LowerBound } from '@data-stores/psql/config-driven/utils/partition-utils'
import type { TrendingTopicsOptions, TrendingTopicsResult } from './types.mts'

const TIME_RANGE_MS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
} as const

const RSS_FEED_ITEM_TOPIC_CATEGORY_RELATION_TABLE = getEntityRelationTableNameOrThrow({
  subjectType: 'rss_feed_item',
  objectType: 'topic',
  predicate: 'category',
})

export async function getTrendingTopics(
  options: TrendingTopicsOptions,
): Promise<TrendingTopicsResult> {
  const { timeRange, minScore, limit, after } = options

  const rangeMs = TIME_RANGE_MS[timeRange]
  if (rangeMs === undefined) {
    throw createHttpError(400, 'Invalid time_range')
  }

  // Use UUIDv7 lower bound for time filtering (avoids unindexed created_at scan)
  const lowerBoundUuid = timestampToUuidv7LowerBound(Date.now() - rangeMs)

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
    WITH post_tags AS (
      SELECT
        r.object_id AS topic_id,
        (COUNT(*) * 5)::DOUBLE PRECISION AS score,
        COUNT(*)::INTEGER AS count
      FROM `
    .append(POST_TOPIC_CATEGORY_RELATION_TABLE)
    .append(sql` r
      WHERE r.deleted_at IS NULL
        AND r.votes_score_net > 0
        AND r.id >= ${lowerBoundUuid}
      GROUP BY r.object_id
    ),
    rss_tags AS (
      SELECT
        r.object_id AS topic_id,
        COUNT(*)::DOUBLE PRECISION AS score,
        COUNT(*)::INTEGER AS count
      FROM `)
    .append(RSS_FEED_ITEM_TOPIC_CATEGORY_RELATION_TABLE).append(sql` r
      WHERE r.deleted_at IS NULL
        AND r.votes_score_net > 0
        AND r.id >= ${lowerBoundUuid}
      GROUP BY r.object_id
    ),
    combined AS (
      SELECT
        t.id,
        (COALESCE(pt.score, 0) + COALESCE(rt.score, 0))::DOUBLE PRECISION AS trending_score,
        COALESCE(pt.count, 0)::INTEGER AS post_tag_count,
        COALESCE(rt.count, 0)::INTEGER AS rss_item_tag_count
      FROM topics t
      LEFT JOIN post_tags pt ON t.id = pt.topic_id
      LEFT JOIN rss_tags rt ON t.id = rt.topic_id
      WHERE t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
        AND (pt.score > 0 OR rt.score > 0)`)

  if (minScore !== undefined) {
    query.append(sql`
        AND (COALESCE(pt.score, 0) + COALESCE(rt.score, 0)) >= ${minScore}`)
  }

  if (cursorScore !== undefined && cursorId !== undefined) {
    query.append(sql`
        AND (COALESCE(pt.score, 0) + COALESCE(rt.score, 0), t.id) < (${cursorScore}, ${cursorId})`)
  }

  query.append(sql`
    )
    SELECT id, trending_score, post_tag_count, rss_item_tag_count
    FROM combined
    ORDER BY trending_score DESC, id DESC
    LIMIT ${safeLimit + 1}
  `)

  const { rows } = await read(query)

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
