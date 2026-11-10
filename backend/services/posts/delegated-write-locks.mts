import createHttpError from 'http-errors'
import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Serialize only the post row this delegated update or delete will write. */
export async function lockDelegatedPostThread(
  query: TransactionQuery,
  postId: string,
): Promise<void> {
  const { rows } = await query<{ id: string }>(sql`/* lockDelegatedPostThread.rows */
    SELECT id FROM posts WHERE id = ${postId} FOR NO KEY UPDATE`)
  if (!rows[0]) throw createHttpError(404, 'Post not found')
}
