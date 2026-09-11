import { read } from '@data-stores/psql'
import { buildPublicPostEligibilityFilter } from '@modules/feed-query-builders'
import sql from 'sql-template-strings'

/** Returns IDs still eligible for anonymous discovery at the serialization boundary. */
export async function getPublicPostIds(postIds: string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set()

  const { rows } = await read<{ id: string }>(
    sql`/* getPublicPostIds */
      SELECT candidate_post.id
      FROM posts candidate_post
      JOIN posts root_post ON root_post.id = COALESCE(candidate_post.root_id, candidate_post.id)
      WHERE candidate_post.id = ANY(${postIds}::uuid[])
        AND `.append(buildPublicPostEligibilityFilter('candidate_post', 'root_post')),
  )
  return new Set(rows.map(row => row.id))
}
