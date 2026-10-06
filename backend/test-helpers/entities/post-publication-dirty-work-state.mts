import { read, write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { acquireTestPostgresAdvisoryLock } from '../postgres-advisory-lock.mts'

const SHADOW_AUDIT_LOCK_NAMESPACE = 2_135_041
const SHADOW_AUDIT_LOCK_KEY = 1

export async function getTestPostPublicationShadowAuditCheckpoint(): Promise<
  string | null | undefined
> {
  const { rows } = await read<{ cursor_post_id: string | null }>(sql`
    /* getTestPostPublicationShadowAuditCheckpoint */
    SELECT cursor_post_id
    FROM post_publication_reconciliation_audit_cursors
    WHERE is_singleton
  `)
  return rows[0]?.cursor_post_id
}

/** Reserves the singleton audit cursor and restores it after the callback. */
export async function withTestPostPublicationShadowAuditLock<T>(run: () => Promise<T>): Promise<T> {
  const lock = await acquireTestPostgresAdvisoryLock({
    namespace: SHADOW_AUDIT_LOCK_NAMESPACE,
    key: SHADOW_AUDIT_LOCK_KEY,
    timeout: '20s',
  })
  const previous = await getTestPostPublicationShadowAuditCheckpoint()
  try {
    return await run()
  } finally {
    try {
      await setTestPostPublicationShadowAuditCheckpoint(previous ?? null)
    } finally {
      await lock.release()
    }
  }
}

export async function setTestPostPublicationShadowAuditCheckpoint(
  cursorPostId: string | null,
): Promise<void> {
  await write(sql`
    /* setTestPostPublicationShadowAuditCheckpoint */
    INSERT INTO post_publication_reconciliation_audit_cursors (is_singleton, cursor_post_id)
    VALUES (TRUE, ${cursorPostId})
    ON CONFLICT (is_singleton) DO UPDATE SET cursor_post_id = EXCLUDED.cursor_post_id
  `)
}

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
