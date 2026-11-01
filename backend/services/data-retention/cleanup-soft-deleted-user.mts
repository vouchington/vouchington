import type { UserPurgeCursor, UserPurgeResult } from './user-purge-types.mts'
import type { RetentionWorkBudget } from './work-budget.mts'
import { getDataRetentionLimits } from './config.mts'
import { beginTransaction, type QueryExecutor, type TransactionQuery } from '@data-stores/psql'
import {
  lockAuthorPublicationLifecycle,
  processAuthorDeletionPublicationBatch,
  retainUserCascadeHardDeletedPosts,
} from '@services/post-publication'
import sql from 'sql-template-strings'
import { cleanupUserPreservedRows } from './cleanup-user-preserved-rows.mts'
import onError from '@modules/on-error'

export const FINAL_USER_PURGE_LOCK_KEY = 'data-retention:final-user-purge'

export async function cleanupSoftDeletedUser(
  targetId: string,
  cutoffDate: Date,
  lowerBoundDate?: Date,
  publicationBatchSize = getDataRetentionLimits().batchSize,
  budget: RetentionWorkBudget = { remainingRows: publicationBatchSize },
  cursor?: UserPurgeCursor,
): Promise<UserPurgeResult> {
  if (budget.remainingRows === 0) return { deleted: 0, hasMore: true }
  await using query = await beginTransaction()
  await lockFinalUserPurge(query, targetId)
  await lockAuthorPublicationLifecycle(query, targetId)
  if (
    !(await lockEligibleSoftDeletedUserForFinalPurge(query, targetId, cutoffDate, lowerBoundDate))
  ) {
    await query.commit()
    return { deleted: 0, hasMore: false }
  }
  // The deletion drain captures the old username before completion clears it. The reconciler
  // retains the published author keys from the last receipt when final purge has only the user id.
  const publication = await processAuthorDeletionPublicationBatch(
    query,
    targetId,
    null,
    Math.min(publicationBatchSize, budget.remainingRows),
  )
  budget.remainingRows -= publication.processed
  if (publication.hasMore || budget.remainingRows === 0) {
    await query.commit()
    return { deleted: 0, hasMore: true }
  }
  const preserved = await cleanupUserPreservedRows(
    query,
    targetId,
    publicationBatchSize,
    budget,
    cursor,
  )
  if (preserved.hasMore) {
    await query.commit()
    await Promise.all(preserved.afterCommit.map(effect => effect().catch(onError)))
    return {
      deleted: 0,
      hasMore: true,
      ...(preserved.userPurge ? { userPurge: preserved.userPurge } : {}),
    }
  }
  // Account finalization changes the legal clock of every linked copyright case. The gate
  // serializes its dirty signal with each bounded case purge page.
  await query(sql`/* lockCopyrightCaseClockSyncAtFinalUserPurge */
    SELECT pg_advisory_xact_lock(hashtextextended('copyright-preservation-retention', 0))`)
  const deleted = await deletePurgedUser(query, targetId)
  budget.remainingRows -= deleted
  await query.commit()
  return { deleted, hasMore: deleted === 0 }
}

async function deletePurgedUser(query: TransactionQuery, targetId: string): Promise<number> {
  await retainUserCascadeHardDeletedPosts(query, targetId)
  const { rows } = await query<{ deleted: number }>(sql`/* cleanupSoftDeletedUserBatch:delete */
    WITH removed AS (
      DELETE FROM users WHERE id = ${targetId}
        AND NOT EXISTS (SELECT 1 FROM community_members WHERE user_id = ${targetId})
        AND NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = ${targetId})
        AND NOT EXISTS (SELECT 1 FROM user_lists WHERE owner_user_id = ${targetId})
        AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = ${targetId})
      RETURNING id
    ), clocked AS (
      UPDATE retained_user_identities identity
      SET purged_at = clock_timestamp(), copyright_case_clock_sync_pending = true
      FROM removed WHERE identity.id = removed.id
      RETURNING identity.id
    )
    SELECT count(*)::integer AS deleted FROM clocked`)
  return rows[0]?.deleted ?? 0
}

async function lockFinalUserPurge(query: QueryExecutor, targetId: string): Promise<void> {
  // DELETE SET NULL can update another purge's user (including reciprocal deleted_by_id).
  // Serialize final purges before taking any target/publication/row lock, across all callers.
  await query(sql`/* cleanupSoftDeletedUserBatch:serializeFinalPurges */
    SELECT pg_advisory_xact_lock(hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0))
  `)
  await query(sql`/* cleanupSoftDeletedUserBatch:lockUser */
    SELECT pg_advisory_xact_lock(hashtextextended(${targetId}, 0))
  `)
}

export async function lockEligibleSoftDeletedUserForFinalPurge(
  query: QueryExecutor,
  targetId: string,
  cutoffDate: Date,
  lowerBoundDate?: Date,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `/* cleanupSoftDeletedUserBatch: check target */
      SELECT id FROM users
      WHERE id = $1 AND deleted_at < $2
        AND ($3::timestamptz IS NULL OR deleted_at >= $3)
        AND NOT EXISTS (
          SELECT 1 FROM user_deletion_requests
          WHERE user_id = users.id AND completed_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1
          FROM memberships membership
          INNER JOIN membership_administrator_refund_operation_requests request
            ON request.membership_id = membership.id
          INNER JOIN membership_operations operation
            ON operation.id = request.membership_operation_id
          WHERE membership.user_id = users.id
            AND operation.completed_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM user_legal_preservation_holds preservation_hold
          WHERE preservation_hold.account_user_id = users.id
            AND preservation_hold.released_at IS NULL
        )
      FOR UPDATE OF users`,
    [targetId, cutoffDate, lowerBoundDate ?? null],
  )
  return rows.length > 0
}
