import type { RetentionWorkBudget } from './work-budget.mts'
import { getDataRetentionLimits } from './config.mts'
import { beginTransaction, type QueryExecutor, type TransactionQuery } from '@data-stores/psql'
import {
  lockAuthorPublicationLifecycle,
  processAuthorDeletionPublicationBatch,
} from '@services/post-publication'
import sql from 'sql-template-strings'
import { cleanupUserPreservedRows } from './cleanup-user-preserved-rows.mts'

export const FINAL_USER_PURGE_LOCK_KEY = 'data-retention:final-user-purge'

export async function cleanupSoftDeletedUser(
  targetId: string,
  cutoffDate: Date,
  lowerBoundDate?: Date,
  publicationBatchSize = getDataRetentionLimits().batchSize,
  budget: RetentionWorkBudget = { remainingRows: publicationBatchSize },
): Promise<{ deleted: number; hasMore: boolean }> {
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
  // The deletion drain captures the old username before completion clears it. Final purge
  // captures every remaining post identity before the user-row cascade removes those posts.
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
  if (await cleanupUserPreservedRows(query, targetId, publicationBatchSize, budget)) {
    await query.commit()
    return { deleted: 0, hasMore: true }
  }
  const deleted = await deletePurgedUser(query, targetId)
  budget.remainingRows -= deleted
  await query.commit()
  return { deleted, hasMore: false }
}

async function deletePurgedUser(query: TransactionQuery, targetId: string): Promise<number> {
  // The committed publication drain must have reassigned every authored post.
  // A remaining row would be silently cascaded by the user FK without a bounded
  // pre-delete capture, so retry its page instead of deleting the user.
  const { rows: remainingPosts } = await query<{ id: string }>(
    `/* cleanupSoftDeletedUserBatch:remainingAuthoredPost */
    SELECT id FROM posts WHERE created_by_id = $1::uuid LIMIT 1`,
    [targetId],
  )
  if (remainingPosts.length > 0)
    throw new Error('Final user purge still has authored posts after publication drain')
  const { rows: initiatedStories } = await query<{ post_id: string }>(
    `/* cleanupSoftDeletedUserBatch:remainingInitiatedStoryPost */
    SELECT post_id FROM story_posts WHERE initiated_by_id = $1::uuid LIMIT 1`,
    [targetId],
  )
  if (initiatedStories.length > 0)
    throw new Error('Final user purge still has initiated story posts after publication drain')
  const { rowCount } = await query(sql`/* cleanupSoftDeletedUserBatch:delete */
      DELETE FROM users WHERE id = ${targetId}`)
  return rowCount ?? 0
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
