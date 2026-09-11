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
): Promise<Array<PostMetrics | null | undefined>> => {
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

  const query = sql`/* getPostMetricsByAnyBatch */
    WITH RECURSIVE id_input AS (
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
      SELECT DISTINCT ON (slug_input.input_order) p.id, p.updated_at, slug_input.input_order
      FROM posts p
      JOIN post_slugs ps ON ps.post_id = p.id
      JOIN slug_input ON ps.slug = slug_input.input_value
      ORDER BY slug_input.input_order, p.id
    ),
    combined_posts AS (
      SELECT id, updated_at, input_order FROM id_lookups
      UNION
      SELECT id, updated_at, input_order FROM slug_lookups
    ),
    requested_posts AS (
      SELECT DISTINCT id, updated_at FROM combined_posts
    ),
    descendant_metrics AS (
      SELECT
        requested.id,
        COUNT(*)::bigint AS count,
        MAX(candidate_post.updated_at) AS updated_at
      FROM requested_posts requested
      JOIN posts candidate_post
        ON candidate_post.root_id = requested.id
       AND candidate_post.id > requested.id
      JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
      WHERE `
  query.append(buildPublicPostEligibilityFilter('candidate_post', 'root_post'))
  query.append(sql`
      GROUP BY requested.id
    ),
    child_metrics AS (
      SELECT
        requested.id,
        COUNT(*)::bigint AS count,
        MAX(candidate_post.updated_at) AS updated_at
      FROM requested_posts requested
      JOIN posts candidate_post
        ON candidate_post.parent_id = requested.id
       AND candidate_post.post_type = 'comment'
       AND candidate_post.id > requested.id
      JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
      WHERE `)
  query.append(buildPublicPostEligibilityFilter('candidate_post', 'root_post'))
  query.append(sql`
      GROUP BY requested.id
    ),
    ancestor_chain AS (
      SELECT requested.id AS requested_id, post.parent_id AS ancestor_id
      FROM requested_posts requested
      JOIN posts post ON post.id = requested.id
      WHERE post.post_type = 'comment'
        AND post.parent_id IS NOT NULL

      UNION ALL

      SELECT chain.requested_id, parent.parent_id
      FROM ancestor_chain chain
      JOIN posts parent ON parent.id = chain.ancestor_id
      WHERE parent.post_type = 'comment'
        AND parent.parent_id IS NOT NULL
    ),
    ancestor_counts AS (
      SELECT chain.requested_id AS id, COUNT(*)::bigint AS count
      FROM ancestor_chain chain
      JOIN posts candidate_post ON candidate_post.id = chain.ancestor_id
      JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
      WHERE `)
  query.append(buildPublicPostEligibilityFilter('candidate_post', 'root_post'))
  query.append(sql`
      GROUP BY chain.requested_id
    )
    SELECT
      cp.id,
      cp.input_order,
      COALESCE(descendant_metrics.count, 0)::bigint AS count__descendants,
      COALESCE(child_metrics.count, 0)::bigint AS count__children,
      COALESCE(ancestor_counts.count, 0)::bigint AS count__ancestors,
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
    LEFT JOIN ancestor_counts ON ancestor_counts.id = cp.id
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
  const { rows } = await read(query, options)

  // Build result array with nulls for missing entries
  const results: Array<PostMetrics | null | undefined> = new Array(idsOrSlugs.length).fill(null)

  for (const row of rows) {
    const { input_order, ...metricsData } = row

    results[input_order] = {
      __entity_type: 'post_metrics',
      id: metricsData.id,
      count: {
        descendants: Number(metricsData.count__descendants) || 0,
        children: Number(metricsData.count__children) || 0,
        ancestors: Number(metricsData.count__ancestors) || 0,
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
