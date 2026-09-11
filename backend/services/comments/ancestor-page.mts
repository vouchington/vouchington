import { read } from '@data-stores/psql'
import { mapCommentRow } from '@modules/search-utils'
import { isSlug, isUUID } from '@modules/utils'
import createError from 'http-errors'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { CommentNode, CommentRow } from './types.mts'

export const COMMENT_ANCESTOR_PAGE_MAX_LIMIT = 5

type CommentAncestorPage = {
  ancestors: CommentNode[]
  hasNextPage: boolean
  nextId: string | null
  startId: string | null
  startNextId: string | null
}

export type CommentAncestorTarget = { id: string; root_id: string | null }

export async function getCommentAncestorPage({
  limit,
  startId,
  target,
}: {
  limit: number
  startId?: string
  target: CommentAncestorTarget
}): Promise<CommentAncestorPage & { rootId: string; targetId: string }> {
  const rootId = target.root_id ?? target.id
  const maxReturnedDepth = startId ? limit - 1 : limit
  const { rows } = await read(
    buildCommentAncestorPageQuery({
      maxReturnedDepth,
      rootId,
      startId: startId ?? target.id,
    }),
  )
  const rawRows = rows.map(row => row as CommentRow & { depth: number; is_root: boolean })
  const root = rawRows.find(row => row.is_root)
  if (!root) throw new Error('Comment ancestor page root is missing')
  const windowRows = rawRows.filter(row => !row.is_root).sort((a, b) => b.depth - a.depth)
  if (startId && windowRows.length === 0) throw createError(400, 'Invalid ancestor cursor')
  const returnedRows = windowRows.filter(row => row.depth <= maxReturnedDepth)
  const sentinel = windowRows.find(row => row.depth === maxReturnedDepth + 1)
  const deepest = returnedRows.at(-1)
  return {
    ancestors: [mapCommentRow(root), ...returnedRows.map(mapCommentRow)],
    hasNextPage: sentinel !== undefined && sentinel.id !== rootId,
    nextId: sentinel && sentinel.id !== rootId ? sentinel.id : null,
    rootId,
    startId: deepest?.id ?? null,
    startNextId: deepest?.parent_id ?? null,
    targetId: target.id,
  }
}

export async function getCommentAncestorTargetByAny(
  idOrSlug: string,
): Promise<CommentAncestorTarget | null> {
  const isId = isUUID(idOrSlug)
  const isSlugValue = isSlug(idOrSlug)
  if (!isId && !isSlugValue) throw createError(422, `Invalid post identifier: ${idOrSlug}`)
  const query = sql`/* getCommentAncestorTargetByAny */
    SELECT posts.id, posts.root_id FROM posts WHERE posts.id = `
  query.append(
    isId
      ? sql`${idOrSlug}`
      : sql`(
          SELECT post_id FROM post_slugs WHERE slug = ${idOrSlug.toLowerCase()} LIMIT 1
        )`,
  )
  query.append(sql` LIMIT 1`)
  const { rows } = await read<CommentAncestorTarget>(query)
  return rows[0] ?? null
}

export function buildCommentAncestorPageQuery({
  maxReturnedDepth,
  rootId,
  startId,
}: {
  maxReturnedDepth: number
  rootId: string
  startId: string
}): SQLStatement {
  return sql`/* buildCommentAncestorPageQuery */
    WITH RECURSIVE ancestor_window AS (
      SELECT posts.id, posts.post_type, posts.root_id, posts.parent_id, posts.community_id, posts.deleted_at, posts.created_at, posts.votes_score_sort, 0 AS depth
      FROM posts WHERE posts.id = ${startId}
        AND (posts.id = ${rootId} OR posts.root_id = ${rootId})
      UNION ALL
      SELECT posts.id, posts.post_type, posts.root_id, posts.parent_id, posts.community_id, posts.deleted_at, posts.created_at, posts.votes_score_sort, ancestor_window.depth + 1
      FROM posts JOIN ancestor_window ON ancestor_window.parent_id = posts.id
      WHERE ancestor_window.post_type = 'comment'
        AND (posts.id = ${rootId} OR posts.root_id = ${rootId})
        AND ancestor_window.depth < ${maxReturnedDepth + 1}
    ), root AS (
      SELECT posts.id, posts.post_type, posts.root_id, posts.parent_id, posts.community_id, posts.deleted_at, posts.created_at, posts.votes_score_sort
      FROM posts WHERE posts.id = ${rootId}
    )
    SELECT 'post' AS __entity_type, root.id, root.post_type, root.root_id, root.parent_id, root.community_id,
      root.deleted_at, root.created_at, 0 AS depth, root.votes_score_sort AS vote_score,
      TRUE AS is_root FROM root
    UNION ALL
    SELECT 'post' AS __entity_type, ancestor_window.id, ancestor_window.post_type,
      ancestor_window.root_id, ancestor_window.parent_id, ancestor_window.community_id, ancestor_window.deleted_at,
      ancestor_window.created_at, ancestor_window.depth,
      ancestor_window.votes_score_sort AS vote_score, FALSE AS is_root
    FROM ancestor_window WHERE ancestor_window.id != ${rootId}
  `
}
