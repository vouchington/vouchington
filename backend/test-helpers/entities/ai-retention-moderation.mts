import { createHash, randomUUID } from 'node:crypto'
import type { TransactionQuery } from '@data-stores/psql'
import { v7 } from 'uuid'

export async function insertCompletedModerationWorkForRetentionTest(
  query: TransactionQuery,
  postId: string,
  completedAt: Date,
): Promise<{ versionId: string; dispositionId: string }> {
  const versionId = v7()
  const attemptId = v7()
  const dispositionId = v7()
  const hash = createHash('sha256').update(randomUUID()).digest('hex')
  await query(
    `/* insertModerationVersionForRetentionTest */
    INSERT INTO post_moderation_versions (id, post_id, content_sha256, policy_revision)
    VALUES ($1, $2, decode($3, 'hex'), 'test-retention')`,
    [versionId, postId, hash],
  )
  await query(
    `/* insertModerationWorkForRetentionTest */
    INSERT INTO post_moderation_work_items (version_id, source, completed_at)
    VALUES ($1, 'openai_omni', $2)`,
    [versionId, completedAt],
  )
  await query(
    `/* insertModerationAttemptForRetentionTest */
    INSERT INTO post_moderation_attempts
      (id, version_id, source, attempt_number, lease_token, completed_at)
    VALUES ($1, $2, 'openai_omni', 1, $3, $4)`,
    [attemptId, versionId, v7(), completedAt],
  )
  await query(
    `/* insertModerationDispositionForRetentionTest */
    INSERT INTO post_moderation_dispositions
      (id, version_id, source, attempt_id, disposition, reason_code)
    VALUES ($1, $2, 'openai_omni', $3, 'pass', 'test-retention')`,
    [dispositionId, versionId, attemptId],
  )
  return { versionId, dispositionId }
}

export async function moderationRetentionStateForTest(
  query: TransactionQuery,
  versionId: string,
  dispositionId: string,
): Promise<{ work: boolean; attempts: number; dispositionAttemptId: string | null }> {
  const work = await query(
    `/* moderationWorkStateForRetentionTest */
    SELECT 1 FROM post_moderation_work_items WHERE version_id = $1`,
    [versionId],
  )
  const attempts = await query(
    `/* moderationAttemptStateForRetentionTest */
    SELECT 1 FROM post_moderation_attempts WHERE version_id = $1`,
    [versionId],
  )
  const disposition = await query<{ attempt_id: string | null }>(
    `/* moderationDispositionStateForRetentionTest */
     SELECT attempt_id FROM post_moderation_dispositions WHERE id = $1`,
    [dispositionId],
  )
  return {
    work: work.rows.length > 0,
    attempts: attempts.rows.length,
    dispositionAttemptId: disposition.rows[0]?.attempt_id ?? null,
  }
}
