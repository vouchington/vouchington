import { read } from '@data-stores/psql'
import { mapCommentRow } from '@modules/search-utils'
import { isSlug, isUUID } from '@modules/utils'
import createError from 'http-errors'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { CommentNode, CommentRow } from './types.mts'

export async function getCommentAncestorsByAny(idOrSlug: string): Promise<CommentNode[]> {
  const isId = isUUID(idOrSlug)
  const isSlugValue = isSlug(idOrSlug)
  if (!isId && !isSlugValue) throw createError(422, `Invalid post identifier: ${idOrSlug}`)
  const query = isId
    ? buildCommentAncestorsQuery(sql`${idOrSlug}`)
    : buildCommentAncestorsQuery(
        sql`/* getCommentAncestorsByAny:fragment */
          (SELECT post_id FROM post_slugs WHERE slug = ${idOrSlug.toLowerCase()} LIMIT 1)`,
      )
  const { rows } = await read(query)
  return rows.map(row => mapCommentRow(row as CommentRow))
}

export function buildCommentAncestorsQuery(idSql: SQLStatement): SQLStatement {
  const query = sql`/* buildCommentAncestorsQuery */
    WITH RECURSIVE ancestors AS (
      SELECT posts.id, posts.post_type, posts.root_id, posts.parent_id, posts.deleted_at, posts.created_at, posts.votes_score_sort, 0 AS depth
      FROM posts WHERE posts.id = `
  query.append(idSql)
  query.append(sql`
      UNION ALL
      SELECT posts.id, posts.post_type, posts.root_id, posts.parent_id, posts.deleted_at, posts.created_at, posts.votes_score_sort, ancestors.depth + 1
      FROM posts JOIN ancestors ON ancestors.parent_id = posts.id
      WHERE ancestors.post_type = 'comment'
    )
    SELECT 'post' AS __entity_type, ancestors.id, ancestors.post_type, ancestors.root_id,
      ancestors.parent_id, ancestors.deleted_at, ancestors.created_at, ancestors.depth,
      ancestors.votes_score_sort AS vote_score
    FROM ancestors ORDER BY ancestors.depth DESC
  `)
  return query
}
