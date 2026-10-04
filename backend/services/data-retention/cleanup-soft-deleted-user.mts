import { getDataRetentionLimits } from './config.mts'
import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
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
): Promise<{ deleted: number; hasMore: boolean }> {
  await using query = await beginTransaction()
  await lockFinalUserPurge(query, targetId)
  await lockAuthorPublicationLifecycle(query, targetId)
  if (
    !(await lockEligibleSoftDeletedUserForFinalPurge(query, targetId, cutoffDate, lowerBoundDate))
  ) {
    await query.commit()
    return { deleted: 0, hasMore: false }
  }
  const { rows: authors } = await query<{ username: string | null }>(sql`
    SELECT username FROM users WHERE id = ${targetId}`)
  const publication = await processAuthorDeletionPublicationBatch(
    query,
    targetId,
    authors[0]?.username ?? null,
    publicationBatchSize,
  )
  if (publication.hasMore) {
    await query.commit()
    return { deleted: 0, hasMore: true }
  }
  if (await cleanupUserPreservedRows(query, targetId, publicationBatchSize)) {
    await query.commit()
    return { deleted: 0, hasMore: true }
  }
  const { rowCount } = await query(sql`/* cleanupSoftDeletedUserBatch:delete */
      DELETE FROM users WHERE id = ${targetId}`)
  await query.commit()
  return { deleted: rowCount ?? 0, hasMore: false }
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
      FOR UPDATE OF users`,
    [targetId, cutoffDate, lowerBoundDate ?? null],
  )
  return rows.length > 0
}
