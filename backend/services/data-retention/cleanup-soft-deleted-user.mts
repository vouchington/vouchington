import type { UserPurgeCursor, UserPurgeResult } from './user-purge-types.mts'
import type { RetentionWorkBudget } from './work-budget.mts'
import { getDataRetentionLimits } from './config.mts'
import { beginTransaction, type QueryExecutor, type TransactionQuery } from '@data-stores/psql'
import {
  processAuthorDeletionPublicationBatch,
  assertAuthorDeletionDrainedPosts,
} from '@services/post-publication'
import sql from 'sql-template-strings'
import { cleanupUserPreservedRows } from './cleanup-user-preserved-rows.mts'
import onError from '@modules/on-error'

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
  if (
    !(await isEligibleSoftDeletedUserForFinalPurge(query, targetId, cutoffDate, lowerBoundDate))
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
  const deleted = await deletePurgedUser(query, targetId, cutoffDate, lowerBoundDate)
  if (deleted === 0) {
    // A hold or lost eligibility arrived after the eligibility read: undo this page's stage deletes too.
    await query.rollback()
    return { deleted: 0, hasMore: true }
  }
  budget.remainingRows -= deleted
  await query.commit()
  return { deleted, hasMore: false }
}

/**
 * READ COMMITTED: every statement reads its own snapshot, so the retention window, open deletion
 * request, open hold and incomplete administrator refund are repeated in the DELETE's WHERE and evaluated after the account lock is
 * granted. A copyright party admitted concurrently is invisible to this snapshot, so the clock sync
 * flag is always set and the sync job settles it from the committed party rows.
 */
async function deletePurgedUser(
  query: TransactionQuery,
  targetId: string,
  cutoffDate: Date,
  lowerBoundDate?: Date,
): Promise<number> {
  await assertAuthorDeletionDrainedPosts(query, targetId)
  // A legal hold placed first must be visible to the DELETE below: it needs a snapshot taken after this lock is granted.
  await query(sql`/* cleanupSoftDeletedUserBatch:lockUser */
    SELECT 1 FROM users WHERE id = ${targetId} FOR NO KEY UPDATE`)
  const { rows } = await query<{ deleted: number }>(sql`/* cleanupSoftDeletedUserBatch:delete */
    WITH removed AS (
      DELETE FROM users WHERE id = ${targetId}
        AND deleted_at < ${cutoffDate}
        AND (${lowerBoundDate ?? null}::timestamptz IS NULL OR deleted_at >= ${lowerBoundDate ?? null})
        AND NOT EXISTS (SELECT 1 FROM user_deletion_requests
          WHERE user_id = users.id AND completed_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM user_legal_preservation_holds preservation_hold
          WHERE preservation_hold.account_user_id = users.id
            AND preservation_hold.released_at IS NULL)
        AND NOT EXISTS (SELECT 1
          FROM membership_administrator_refund_operation_requests refund_request
          INNER JOIN membership_operations operation
            ON operation.id = refund_request.membership_operation_id
          INNER JOIN membership_lineage_bindings binding
            ON binding.id = operation.membership_lineage_binding_id
          WHERE binding.user_id = users.id AND operation.completed_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM community_members WHERE user_id = ${targetId})
        AND NOT EXISTS (SELECT 1 FROM notifications WHERE user_id = ${targetId})
        AND NOT EXISTS (SELECT 1 FROM user_lists WHERE owner_user_id = ${targetId})
        AND NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = ${targetId})
      RETURNING id
    ), clocked AS (
      UPDATE retained_user_identities identity
      SET purged_at = clock_timestamp(),
        is_copyright_case_clock_sync_pending = true
      FROM removed WHERE identity.id = removed.id
      RETURNING identity.id
    )
    SELECT count(*)::integer AS deleted FROM clocked`)
  return rows[0]?.deleted ?? 0
}

export async function isEligibleSoftDeletedUserForFinalPurge(
  query: QueryExecutor,
  targetId: string,
  cutoffDate: Date,
  lowerBoundDate?: Date,
): Promise<boolean> {
  // Grant mutations write entitlement effects with a users FK. Check eligibility without
  // prelocking that parent before cleanup writes the grants; DELETE takes the user lock last.
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
          FROM membership_administrator_refund_operation_requests refund_request
          INNER JOIN membership_operations operation
            ON operation.id = refund_request.membership_operation_id
          INNER JOIN membership_lineage_bindings binding
            ON binding.id = operation.membership_lineage_binding_id
          WHERE binding.user_id = users.id AND operation.completed_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM user_legal_preservation_holds preservation_hold
          WHERE preservation_hold.account_user_id = users.id
            AND preservation_hold.released_at IS NULL
        )`,
    [targetId, cutoffDate, lowerBoundDate ?? null],
  )
  return rows.length > 0
}
