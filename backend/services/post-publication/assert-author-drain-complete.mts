import type { TransactionQuery } from '@data-stores/psql'

/**
 * Final user deletion holds the author lifecycle lock after the bounded author drain. Any remaining
 * post violates that drain's completion contract: reject the cascade instead of traversing an
 * unbounded descendant tree or destroying publication identities that were never retained.
 */
export async function assertAuthorDeletionDrainedPosts(
  query: TransactionQuery,
  userId: string,
): Promise<void> {
  const { rows } = await query<{ id: string }>(
    `/* assertAuthorDeletionDrainedPosts */
    SELECT id FROM posts WHERE created_by_id = $1 ORDER BY id LIMIT 1`,
    [userId],
  )
  if (rows.length > 0) throw new Error('User still owns posts after the author deletion drain')
}
