import createHttpError from 'http-errors'
import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Serialize only the post row this delegated update or delete will write. */
export async function lockDelegatedPostThread(
  query: TransactionQuery,
  postId: string,
): Promise<void> {
  // lock-reason: prevents: delegated authorization and updates acting on different versions of the written post; writer: delegated edits and post deletion.
  const { rows } = await query<{ id: string }>(sql`/* lockDelegatedPostThread.rows */
    SELECT id FROM posts WHERE id = ${postId} FOR NO KEY UPDATE`)
  if (!rows[0]) throw createHttpError(404, 'Post not found')
}
