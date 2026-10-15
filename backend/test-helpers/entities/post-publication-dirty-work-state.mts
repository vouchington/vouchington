import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Makes one owned lease stale without touching concurrent dirty-work fixtures. */
export async function expireTestPostPublicationDirtyWorkLease(dirtyWorkId: string): Promise<void> {
  await write(sql`
    /* expireTestPostPublicationDirtyWorkLease */
    UPDATE post_publication_dirty_work
    SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
    WHERE id = ${dirtyWorkId}
  `)
}

export async function updateTestPostTitleInTransaction(
  query: TransactionQuery,
  postId: string,
  title: string,
): Promise<void> {
  await query(`/* updateTestPostTitleInTransaction */ UPDATE posts SET title = $1 WHERE id = $2`, [
    title,
    postId,
  ])
}
