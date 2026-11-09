import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import { isUUID, isSlug } from '@modules/utils'
import type { PostMetrics } from './types.mts'
import createError from 'http-errors'
import sql from 'sql-template-strings'

export const getPostMetricsByAnyBatch = async (
  idsOrSlugs: string[],
  options: QueryOptions = {},
): Promise<Array<PostMetrics | null>> => {
  if (idsOrSlugs.length === 0) {
    return []
  }

  // Normalize and validate inputs
  const normalizedInputs = idsOrSlugs.map((input, index) => {
    const trimmed = input.trim()
    const normalized = trimmed.toLowerCase()

    if (isUUID(trimmed)) {
      return { value: trimmed, isId: true, index }
    } else if (isSlug(normalized)) {
      return { value: normalized, isId: false, index }
    }
    throw createError(422, `Invalid post identifier: ${input}`)
  })

  // Separate UUIDs and slugs
  const idInputs = normalizedInputs.filter(i => i.isId)
  const slugInputs = normalizedInputs.filter(i => !i.isId)

  const query = buildPostMetricsBatchQuery(idInputs, slugInputs)
  const { rows } = await read<{
    id: string
    input_order: number
    count__descendants: string
    count__children: string
    updated_at: Date
    bookmarks__follow: string
    bookmarks__save: string
  }>(query.text, query.values, options)

  // Build result array with nulls for missing entries
  const results: Array<PostMetrics | null> = new Array(idsOrSlugs.length).fill(null)

  for (const row of rows) {
    const { input_order, ...metricsData } = row

    results[input_order] = {
      __entity_type: 'post_metrics',
      id: metricsData.id,
      count: {
        descendants: Number(metricsData.count__descendants) || 0,
        children: Number(metricsData.count__children) || 0,
      },
      updated_at: metricsData.updated_at,
      bookmarks: {
        follow: Number(metricsData.bookmarks__follow) || 0,
        save: Number(metricsData.bookmarks__save) || 0,
      },
    }
  }

  return results
}

type NormalizedInput = { value: string; isId: boolean; index: number }

function buildPostMetricsBatchQuery(idInputs: NormalizedInput[], slugInputs: NormalizedInput[]) {
  const query = sql`/* getPostMetricsByAnyBatch */
    WITH id_input AS (
      SELECT unnest(${idInputs.map(i => i.value)}::uuid[]) AS input_value,
             unnest(${idInputs.map(i => i.index)}::int[]) AS input_order
    ),
    slug_input AS (
      SELECT unnest(${slugInputs.map(i => i.value)}::text[]) AS input_value,
             unnest(${slugInputs.map(i => i.index)}::int[]) AS input_order
    ),
    id_lookups AS (
      SELECT p.id, p.updated_at, id_input.input_order
      FROM posts p
      JOIN id_input ON p.id = id_input.input_value
    ),
    slug_lookups AS (
      SELECT p.id, p.updated_at, slug_input.input_order
      FROM posts p
      JOIN post_slugs ps ON ps.post_id = p.id
      JOIN slug_input ON ps.slug = slug_input.input_value
    ),
    combined_posts AS (
      SELECT id, updated_at, input_order FROM id_lookups
      UNION
      SELECT id, updated_at, input_order FROM slug_lookups
    ),
    requested_posts AS (
      SELECT DISTINCT id, updated_at FROM combined_posts
    ),
    metric_candidates AS MATERIALIZED (
      SELECT
        candidate_post.id,
        candidate_post.root_post_id,
        candidate_post.parent_post_id,
        candidate_post.post_type,
        candidate_post.updated_at
      FROM posts candidate_post
      JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_post_id, candidate_post.id)
      WHERE (
        candidate_post.root_post_id = ANY(ARRAY(SELECT id FROM requested_posts))
        OR candidate_post.parent_post_id = ANY(ARRAY(SELECT id FROM requested_posts))
      )
        AND candidate_post.id > (SELECT id FROM requested_posts ORDER BY id LIMIT 1)
        AND `
  query.append(buildPublicPostEligibilityFilter('candidate_post', 'root_post'))
  query.append(sql`
    ),
    descendant_metrics AS (
      SELECT
        requested.id,
        COUNT(*)::bigint AS count,
        MAX(candidate_post.updated_at) AS updated_at
      FROM requested_posts requested
      JOIN metric_candidates candidate_post
        ON candidate_post.root_post_id = requested.id
       AND candidate_post.id > requested.id
      GROUP BY requested.id
    ),
    child_metrics AS (
      SELECT
        requested.id,
        COUNT(*)::bigint AS count,
        MAX(candidate_post.updated_at) AS updated_at
      FROM requested_posts requested
      JOIN metric_candidates candidate_post
        ON candidate_post.parent_post_id = requested.id
       AND candidate_post.post_type = 'comment'
       AND candidate_post.id > requested.id
      GROUP BY requested.id
    )
    SELECT
      cp.id,
      cp.input_order,
      COALESCE(descendant_metrics.count, 0)::bigint AS count__descendants,
      COALESCE(child_metrics.count, 0)::bigint AS count__children,
      COALESCE(follow_counts.count, 0)::bigint AS bookmarks__follow,
      COALESCE(save_counts.count, 0)::bigint AS bookmarks__save,
      GREATEST(
        cp.updated_at,
        COALESCE(descendant_metrics.updated_at, cp.updated_at),
        COALESCE(child_metrics.updated_at, cp.updated_at)
      ) AS updated_at
    FROM combined_posts cp
    LEFT JOIN descendant_metrics ON descendant_metrics.id = cp.id
    LEFT JOIN child_metrics ON child_metrics.id = cp.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS count
      FROM relation__user__follow__post relation
      WHERE relation.object_id = cp.id
        AND relation.deleted_at IS NULL
    ) follow_counts ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::bigint AS count
      FROM relation__user__save__post relation
      WHERE relation.object_id = cp.id
        AND relation.deleted_at IS NULL
    ) save_counts ON TRUE
    ORDER BY cp.input_order
  `)
  return query
}
