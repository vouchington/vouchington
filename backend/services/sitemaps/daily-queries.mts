import { read } from '@data-stores/psql'
import { getUtcDayUuidv7Bounds } from '@vouchington/postgres/partitions'
import sql, { type SQLStatement } from 'sql-template-strings'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import type { SitemapPostType, SitemapPostWithId } from './types.mts'

export async function readPostsForDayPage(
  postType: SitemapPostType,
  day: string,
  options: { highWaterId?: string; afterId?: string; limit: number },
): Promise<SitemapPostWithId[]> {
  const { rows } = await read(buildPostsForDayQuery(postType, day, options))
  return rows as SitemapPostWithId[]
}

export function buildPostsForDayQuery(
  postType: SitemapPostType,
  day: string,
  options?: { highWaterId?: string; afterId?: string; limit: number },
) {
  const bounds = getUtcDayUuidv7Bounds(day)

  const query = sql`/* buildPostsForDayQuery */
    SELECT
      p.id,
      latest_slug.slug,
      p.post_type,
      p.updated_at,
  `
  query.append(reviewUpdatedAtColumn(postType))
  query.append(sql`
    FROM posts p
    JOIN posts root_post ON root_post.id = COALESCE(p.root_post_id, p.id)
`)
  query.append(reviewRatingsJoin(postType))
  query.append(buildLatestPostSlugJoinSql())
  query.append(buildEligiblePostsForDayWhereSql(postType, bounds))
  query.append(buildPostHasSlugExistsPredicateSql())
  if (options?.highWaterId) query.append(sql` AND p.id <= ${options.highWaterId}`)
  if (options?.afterId) query.append(sql` AND p.id < ${options.afterId}`)
  query.append(sql` ORDER BY p.id DESC `)
  if (options) query.append(sql` LIMIT ${options.limit}`)

  return query
}

function reviewUpdatedAtColumn(postType: SitemapPostType): SQLStatement {
  switch (postType) {
    case 'review':
      return sql`pr.updated_at AS review_updated_at`
    default:
      return sql`NULL::TIMESTAMPTZ AS review_updated_at`
  }
}

function reviewRatingsJoin(postType: SitemapPostType): SQLStatement {
  switch (postType) {
    case 'review':
      return sql`LEFT JOIN LATERAL (
      SELECT MAX(prtr.updated_at) AS updated_at
      FROM post_review_topic_ratings prtr
      WHERE prtr.post_id = p.id
    ) pr ON TRUE`
    default:
      return sql``
  }
}

function buildLatestPostSlugJoinSql() {
  return sql`/* buildLatestPostSlugJoinSql:fragment */
    LEFT JOIN LATERAL (
      SELECT ps.slug
      FROM post_slugs ps
      WHERE ps.post_id = p.id
      ORDER BY ps.id DESC
      LIMIT 1
    ) AS latest_slug ON true
  `
}

function buildPostHasSlugExistsPredicateSql() {
  return sql`/* buildPostHasSlugExistsPredicateSql:fragment */
    AND EXISTS (
      SELECT 1
      FROM post_slugs ps
      WHERE ps.post_id = p.id
    )
  `
}

function buildEligiblePostsForDayWhereSql(
  postType: SitemapPostType,
  bounds: { startBound: string; endBound: string },
) {
  return sql`/* buildEligiblePostsForDayWhereSql:fragment */
    WHERE p.post_type = ${postType}
      AND p.id >= ${bounds.startBound}
      AND p.id < ${bounds.endBound}
      AND `.append(buildPublicPostEligibilityFilter('p', 'root_post')).append(sql`
      AND p.votes_score_net > 0
  `)
}
