import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Returns community IDs for all approved, non-unpublished reviews of a post.
 * Used to re-trigger community moderation when post content changes.
 */
export async function getApprovedReviewsForPost(
  postId: string,
  options: QueryOptions = {},
): Promise<string[]> {
  const runQuery = options.readOnly === false ? write : read
  const { rows } = await runQuery(
    sql`/* getApprovedReviewsForPost */
    SELECT community_id
    FROM community_post_reviews
    WHERE post_id = ${postId}
      AND approved_at IS NOT NULL
      AND unpublished_at IS NULL
      AND rejected_at IS NULL
  `,
    options,
  )
  return rows.map((r: { community_id: string }) => r.community_id)
}
