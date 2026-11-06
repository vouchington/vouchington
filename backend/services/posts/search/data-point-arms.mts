import { buildSourceBoundPostEligibilityFilter } from '@modules/feed-query-builders'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { SearchDataPointsOptions } from './data-point-types.mts'

/** A bound from DynamicConfig, inlined so a generic plan sees the same LIMIT as a custom plan. */
export function dataPointLimitLiteral(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 101) {
    throw new Error('data-point page limit is outside its configured bound')
  }
  return String(value)
}

export function appendNullArm(
  query: SQLStatement,
  options: SearchDataPointsOptions,
  postUpper: string | null,
  lookahead: number,
): void {
  query.append(sql`
      SELECT
        'null'::text AS phase,
        0::int AS parent_ord,
        NULL::uuid AS community_id,
        posts.id AS post_id,
        posts.title,
        posts.data_point_vertical,
        COALESCE(posts.structured_data, '{}'::jsonb) AS structured_data,
        (`)
  query.append(buildSourceBoundPostEligibilityFilter('posts', 'root_post', null))
  query.append(sql`) AS eligible
      FROM (
        SELECT id
        FROM posts
        WHERE post_type = 'data_point'
          AND deleted_at IS NULL
          AND community_id IS NULL
          AND `)
  appendDataPointFilters(query, options)
  if (postUpper) query.append(sql` AND id < ${postUpper}::uuid`)
  query.append(sql`
        ORDER BY id DESC
        LIMIT `)
  query.append(dataPointLimitLiteral(lookahead))
  query.append(sql`
      ) slice
      JOIN posts ON posts.id = slice.id
      LEFT JOIN posts root_post ON root_post.id = COALESCE(posts.root_post_id, posts.id)`)
}

export function appendCommunityArm(
  query: SQLStatement,
  arm: {
    fromSql: SQLStatement
    whereSql: SQLStatement | null
    ordSql: SQLStatement
    postUpper: string | null
    options: SearchDataPointsOptions
    lookahead: number
  },
): void {
  query.append(sql`
      SELECT
        'community'::text AS phase,
        `)
  query.append(arm.ordSql)
  query.append(sql` AS parent_ord,
        community.id AS community_id,
        posts.id AS post_id,
        posts.title,
        posts.data_point_vertical,
        COALESCE(posts.structured_data, '{}'::jsonb) AS structured_data,
        CASE
          WHEN posts.id IS NULL OR root_post.id IS NULL THEN false
          ELSE (`)
  query.append(buildSourceBoundPostEligibilityFilter('posts', 'root_post', null))
  query.append(sql`)
        END AS eligible
      FROM `)
  query.append(arm.fromSql)
  query.append(sql`
      LEFT JOIN LATERAL (
        SELECT id
        FROM posts
        WHERE post_type = 'data_point'
          AND deleted_at IS NULL
          AND community_id = community.id
          AND `)
  appendDataPointFilters(query, arm.options)
  if (arm.postUpper) query.append(sql` AND id < ${arm.postUpper}::uuid`)
  query.append(sql`
        ORDER BY id DESC
        LIMIT `)
  query.append(dataPointLimitLiteral(arm.lookahead))
  query.append(sql`
      ) slice ON TRUE
      LEFT JOIN posts ON posts.id = slice.id
      LEFT JOIN posts root_post
        ON posts.id IS NOT NULL
       AND root_post.id = COALESCE(posts.root_post_id, posts.id)`)
  if (arm.whereSql) query.append(sql`\n`).append(arm.whereSql)
}

function appendDataPointFilters(query: SQLStatement, options: SearchDataPointsOptions): void {
  query.append(sql`TRUE`)
  if (options.topic_id) {
    query.append(
      sql` AND EXISTS (
        SELECT 1
        FROM post_data_point_topics pdpt
        WHERE pdpt.post_id = posts.id
          AND pdpt.topic_id = ${options.topic_id}
      )`,
    )
  }
  if (options.vertical) query.append(sql` AND posts.data_point_vertical = ${options.vertical}`)
  if (options.result) query.append(sql` AND posts.structured_data->>'result' = ${options.result}`)
  if (options.credit_score_range) {
    query.append(
      sql` AND posts.structured_data->>'credit_score_range' = ${options.credit_score_range}`,
    )
  }
}
