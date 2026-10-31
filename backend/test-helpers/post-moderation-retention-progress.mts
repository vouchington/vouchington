import { read, write, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setTestPostModerationRetentionHash(
  postId: string,
  digest: Buffer,
  query: QueryExecutor = write,
): Promise<void> {
  await query(sql`/* setTestPostModerationRetentionHash */
    UPDATE posts SET llm_moderation_content_sha256 = ${digest} WHERE id = ${postId}::uuid
  `)
}

export async function getTestPostModerationVersionMarkers(
  versionId: string,
  query: QueryExecutor = read,
): Promise<{
  successorAt: Date | null
  dueAt: Date | null
  hashBlockedAt: Date | null
} | null> {
  const { rows } = await query<{
    successorAt: Date | null
    dueAt: Date | null
    hashBlockedAt: Date | null
  }>(sql`/* getTestPostModerationVersionMarkers */
    SELECT retention_successor_at AS "successorAt", retention_due_at AS "dueAt",
      retention_hash_blocked_at AS "hashBlockedAt"
    FROM post_moderation_versions WHERE id = ${versionId}::uuid
  `)
  return rows[0] ?? null
}

export async function getTestPostModerationDispositionDueAt(
  dispositionId: string,
  query: QueryExecutor = read,
): Promise<Date | null> {
  const { rows } = await query<{ retention_due_at: Date | null }>(sql`
    /* getTestPostModerationDispositionDueAt */
    SELECT retention_due_at FROM post_moderation_dispositions WHERE id = ${dispositionId}::uuid
  `)
  return rows[0]?.retention_due_at ?? null
}

export async function getTestPostModerationPostWork(
  postId: string,
  query: QueryExecutor = read,
): Promise<{ cursorVersionId: string; cursorDispositionId: string } | null> {
  const { rows } = await query<{
    cursorVersionId: string
    cursorDispositionId: string
  }>(sql`/* getTestPostModerationPostWork */
    SELECT cursor_version_record_id AS "cursorVersionId",
      cursor_disposition_record_id AS "cursorDispositionId"
    FROM post_moderation_retention_post_work_items WHERE post_id = ${postId}::uuid
  `)
  return rows[0] ?? null
}

export async function setTestPostModerationPolicyRevisionCursor(
  revision: string,
  afterId: string,
  query: QueryExecutor,
): Promise<void> {
  await query(sql`/* setTestPostModerationPolicyRevisionCursor */
    INSERT INTO post_moderation_retention_cursors
      (kind, observed_policy_revision, cursor_policy_version_record_id, policy_sweep_completed_at)
    VALUES ('superseded_versions', ${revision}, ${afterId}::uuid, CURRENT_TIMESTAMP)
    ON CONFLICT (kind) DO UPDATE SET observed_policy_revision = EXCLUDED.observed_policy_revision,
      cursor_policy_version_record_id = EXCLUDED.cursor_policy_version_record_id,
      policy_sweep_completed_at = EXCLUDED.policy_sweep_completed_at
  `)
}

export async function getTestPostModerationPolicyRevisionCursor(
  query: QueryExecutor = read,
): Promise<{ observedRevision: string | null; completedAt: Date | null } | null> {
  const { rows } = await query<{
    observedRevision: string | null
    completedAt: Date | null
  }>(sql`/* getTestPostModerationPolicyRevisionCursor */
    SELECT observed_policy_revision AS "observedRevision",
      policy_sweep_completed_at AS "completedAt"
    FROM post_moderation_retention_cursors WHERE kind = 'superseded_versions'
  `)
  return rows[0] ?? null
}
