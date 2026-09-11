import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID, isSlug } from '@modules/utils'
import type { PostMetrics } from './types.mts'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import createError from 'http-errors'
import sql from 'sql-template-strings'

export const getPostMetricsByAny = async (
  idOrSlug: string,
  options: QueryOptions = {},
): Promise<PostMetrics | null> => {
  const isId = isUUID(idOrSlug)
  const isSlugValue = isSlug(idOrSlug)

  if (!isId && !isSlugValue) {
    throw createError(422, `Invalid post identifier: ${idOrSlug}`)
  }

  const idOrSlugValue = isId ? idOrSlug : idOrSlug.toLowerCase()
  const query = sql`/* getPostMetricsByAny */ WITH `

  if (isSlugValue) {
    query.append(sql`
      slug_lookup AS (
        SELECT post_id
        FROM post_slugs
        WHERE slug = ${idOrSlugValue}
        LIMIT 1
      ),
    `)
  }

  query.append(sql`
    base_post AS (
      SELECT id, updated_at
      FROM posts
      WHERE id =
  `)
  query.append(isId ? sql`${idOrSlugValue}` : sql`(SELECT post_id FROM slug_lookup)`)
  query.append(sql`
      LIMIT 1
    )
    SELECT
      base_post.id,
      (
        SELECT COUNT(*)::bigint
        FROM posts candidate_post
        JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
        WHERE candidate_post.root_id = base_post.id
          AND candidate_post.id > base_post.id -- UUIDv7 partition pruning
          AND `)
  query.append(buildPublicPostEligibilityFilter('candidate_post', 'root_post'))
  query.append(sql`
      ) AS count__descendants,
      (
        SELECT COUNT(*)::bigint
        FROM posts candidate_post
        JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
        WHERE candidate_post.parent_id = base_post.id
          AND candidate_post.post_type = 'comment'
          AND candidate_post.id > base_post.id -- UUIDv7 partition pruning
          AND `)
  query.append(buildPublicPostEligibilityFilter('candidate_post', 'root_post'))
  query.append(sql`
      ) AS count__children,
      (
        SELECT COUNT(*)::bigint
        FROM posts candidate_post
        JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
        WHERE candidate_post.id IN (
          WITH RECURSIVE ancestor_chain AS (
            SELECT parent_id
            FROM posts
            WHERE id = base_post.id
              AND post_type = 'comment'
            UNION ALL
            SELECT p.parent_id
            FROM posts p
            INNER JOIN ancestor_chain ac ON p.id = ac.parent_id
            WHERE p.parent_id IS NOT NULL
              AND p.post_type = 'comment'
          )
          SELECT parent_id FROM ancestor_chain WHERE parent_id IS NOT NULL
        )
          AND `)
  query.append(buildPublicPostEligibilityFilter('candidate_post', 'root_post'))
  query.append(sql`
      ) AS count__ancestors,
      (
        SELECT COUNT(*)::bigint
        FROM relation__user__follow__post
        WHERE object_id = base_post.id
          AND deleted_at IS NULL
      ) AS bookmarks__follow,
      (
        SELECT COUNT(*)::bigint
        FROM relation__user__save__post
        WHERE object_id = base_post.id
          AND deleted_at IS NULL
      ) AS bookmarks__save,
      (
        SELECT GREATEST(
          COALESCE(MAX(candidate_post.updated_at), base_post.updated_at),
          base_post.updated_at
        )
        FROM posts candidate_post
        JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
        WHERE (
          candidate_post.root_id = base_post.id
          OR (candidate_post.parent_id = base_post.id AND candidate_post.post_type = 'comment')
        )
          AND candidate_post.id > base_post.id -- UUIDv7 partition pruning
          AND `)
  query.append(buildPublicPostEligibilityFilter('candidate_post', 'root_post'))
  query.append(sql`
      ) AS updated_at
    FROM base_post
  `)

  const { rows } = await read(query, options)

  if (!rows[0]) return null

  const row = rows[0]

  return {
    __entity_type: 'post_metrics',
    id: row.id,
    count: {
      descendants: Number(row.count__descendants) || 0,
      children: Number(row.count__children) || 0,
      ancestors: Number(row.count__ancestors) || 0,
    },
    updated_at: row.updated_at,
    bookmarks: {
      follow: Number(row.bookmarks__follow) || 0,
      save: Number(row.bookmarks__save) || 0,
    },
  }
}
