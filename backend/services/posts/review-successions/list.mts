import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import sql from 'sql-template-strings'
import type { ReviewSuccession } from './types.mts'

/** Lists immutable automatic archive epochs involving any supplied review post. */
export async function listReviewSuccessionsForPostIds(
  postIds: readonly string[],
): Promise<ReviewSuccession[]> {
  const ids = normalizeReviewSuccessionPostIds(postIds)
  if (ids.length === 0) return []
  const { rows } = await read<ReviewSuccession>(sql`/* listReviewSuccessionsForPostIds */
    SELECT id, predecessor_post_id, successor_post_id, author_user_id, topic_ids,
      predecessor_archived_at, automatically_restored_at, manual_override_at
    FROM review_successions
    WHERE predecessor_post_id = ANY(${ids}::uuid[])
       OR successor_post_id = ANY(${ids}::uuid[])
    ORDER BY predecessor_post_id, predecessor_archived_at
  `)
  return rows
}

export function normalizeReviewSuccessionPostIds(postIds: readonly string[]): string[] {
  const ids = [...new Set(postIds)]
  if (ids.some(postId => !isUUID(postId)))
    throw new TypeError('Review succession post IDs must be UUIDs')
  return ids.toSorted()
}
