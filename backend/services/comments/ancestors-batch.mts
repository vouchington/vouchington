import { read, type QueryOptions } from '@data-stores/psql'
import { mapCommentRow } from '@modules/search-utils'
import sql from 'sql-template-strings'
import type { CommentNode, CommentRow } from './types.mts'

// Selects only the columns `mapCommentRow` reads.
type BatchAncestorRow = CommentRow & { origin_id: string }

/**
 * The thread chain of every post in one recursive query: for each requested id, the post itself
 * and, for a comment, its parent chain up to the thread root, root first. Deleted posts are
 * included (check `deleted_at`). An id that matches no post has no entry.
 */
export async function getCommentAncestorsBatch(
  postIds: string[],
  options: QueryOptions = {},
): Promise<Map<string, CommentNode[]>> {
  const chains = new Map<string, CommentNode[]>()
  if (postIds.length === 0) return chains
  const { rows } = await read<BatchAncestorRow>(
    sql`/* getCommentAncestorsBatch */
      WITH RECURSIVE ancestors AS (
        SELECT posts.id AS origin_id, posts.id, posts.post_type, posts.root_post_id, posts.parent_post_id, posts.deleted_at, 0 AS depth
        FROM posts WHERE posts.id = ANY(${postIds}::uuid[])
        UNION ALL
        SELECT ancestors.origin_id, posts.id, posts.post_type, posts.root_post_id, posts.parent_post_id, posts.deleted_at, ancestors.depth + 1
        FROM posts JOIN ancestors ON ancestors.parent_post_id = posts.id
        WHERE ancestors.post_type = 'comment'
      )
      SELECT 'post' AS __entity_type, origin_id, id, post_type, root_post_id, parent_post_id, deleted_at
      FROM ancestors ORDER BY origin_id, depth DESC
    `,
    options,
  )
  for (const row of rows) {
    const chain = chains.get(row.origin_id) ?? []
    chain.push(mapCommentRow(row))
    chains.set(row.origin_id, chain)
  }
  return chains
}
