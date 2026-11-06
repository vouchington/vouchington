import { HOT_SORT_HALF_LIFE_SECONDS } from '@modules/feed-query-builders'
import { encodeCursor } from '@modules/pagination'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type CommunityFeedPost = {
  id: string
  hot_score?: string | number
  [key: string]: unknown
}

export type CommunityPostSort = 'new' | 'hot'

export function encodeCommunityPostCursor(
  sort: CommunityPostSort,
  post: CommunityFeedPost,
): string {
  if (sort === 'hot') {
    const hotScore = Number(post.hot_score)
    assert(Number.isFinite(hotScore), 500, 'hot_score missing from query result')
    return encodeCursor({ score: hotScore, id: post.id })
  }
  return encodeCursor({ id: post.id })
}

export function buildCommunityPostHotScoreExpression() {
  const ageFactor = sql`(EXTRACT(EPOCH FROM (uuid_extract_timestamp(posts.id) - TIMESTAMPTZ '2026-01-01 00:00:00+00')) / ${HOT_SORT_HALF_LIFE_SECONDS} * LN(2.0))`
  // A tiny positive weighted vote can round the generated confidence score to zero.
  const expression = sql`(
    CASE
      WHEN posts.votes_score_sort > 0 THEN 1000000000.0 + LN(posts.votes_score_sort::DOUBLE PRECISION) + `
  expression.append(ageFactor)
  expression.append(sql`
      ELSE 0.0
    END
  )::DOUBLE PRECISION`)
  return expression
}
