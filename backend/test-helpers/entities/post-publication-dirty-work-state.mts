import { read, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { writeTestPostPublicationProtocol as writePostPublicationProtocol } from '../data-stores/psql/post-publication-protocol.mts'

export async function getTestPostPublicationShadowAuditCheckpoint(
  checkpointName: string,
): Promise<string | null | undefined> {
  const { rows } = await read<{ cursor_post_id: string | null }>(sql`
    /* getTestPostPublicationShadowAuditCheckpoint */
    SELECT cursor_post_id
    FROM post_publication_reconciliation_audit_checkpoints
    WHERE checkpoint_name = ${checkpointName}
  `)
  return rows[0]?.cursor_post_id
}

export async function setTestPostPublicationShadowAuditCheckpoint(
  checkpointName: string,
  cursorPostId: string | null,
): Promise<void> {
  await writePostPublicationProtocol(sql`
    /* setTestPostPublicationShadowAuditCheckpoint */
    INSERT INTO post_publication_reconciliation_audit_checkpoints (checkpoint_name, cursor_post_id)
    VALUES (${checkpointName}, ${cursorPostId})
    ON CONFLICT (checkpoint_name) DO UPDATE SET cursor_post_id = EXCLUDED.cursor_post_id
  `)
}

/** Makes one owned lease stale without touching concurrent dirty-work fixtures. */
export async function expireTestPostPublicationDirtyWorkLease(dirtyWorkId: string): Promise<void> {
  await writePostPublicationProtocol(sql`
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
