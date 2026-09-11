import { read } from '@data-stores/psql'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import {
  buildHotScoreExpression,
  buildPublicPostEligibilityFilter,
} from '@modules/feed-query-builders'
import { clampLimit } from '@modules/search-utils'
import { buildPageInfo, decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import { isUUID, getMinUUIDv7ForDate } from '@modules/utils'
import { POST_TOPIC_CATEGORY_RELATION_TABLE } from '@services/entity-relations/metadata'
import type { TrendingPostsOptions, TrendingPostsResult } from './types.mts'

const DEFAULT_LIMIT = 20

const TIME_RANGE_DAYS = {
  day: 1,
  week: 7,
  month: 30,
} as const

export async function getTrendingPosts(
  options: TrendingPostsOptions,
): Promise<TrendingPostsResult> {
  const { timeRange, postType, topicId, minScore, limit, after } = options

  const days = TIME_RANGE_DAYS[timeRange]
  if (days === undefined) {
    throw createHttpError(400, 'Invalid time_range')
  }

  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const cutoffId = getMinUUIDv7ForDate(cutoffDate)

  if (topicId !== undefined && !isUUID(topicId)) {
    throw createHttpError(400, 'Invalid topic_id: must be a valid UUID')
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

  const query = sql`/* getTrendingPosts */
    WITH trending AS (
      SELECT
        p.id,
        `.append(buildHotScoreExpression('p')).append(sql` AS trending_score
      FROM posts p
      JOIN posts root_post ON root_post.id = COALESCE(p.root_id, p.id)`)

  if (topicId !== undefined) {
    query.append('\n      INNER JOIN ').append(POST_TOPIC_CATEGORY_RELATION_TABLE).append(sql` r
        ON r.subject_id = p.id AND r.object_id = ${topicId}
        AND r.deleted_at IS NULL AND r.votes_score_net > 0`)
  }

  query.append(sql`
      WHERE `)
  query.append(buildPublicPostEligibilityFilter('p', 'root_post')).append(sql`
        AND p.votes_score_net > 0
        AND p.post_type NOT IN ('comment', 'topic_recommendation')
        AND p.id >= ${cutoffId}`)

  if (postType !== undefined) {
    query.append(sql`
        AND p.post_type = ${postType}`)
  }

  query.append(sql`
    )
    SELECT id, trending_score
    FROM trending
    WHERE trending_score > 0`)

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
  const results = rows.slice(0, safeLimit) as TrendingPostsResult['results']

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: item => ({ score: item.trending_score, id: item.id }),
    }),
  }
}
