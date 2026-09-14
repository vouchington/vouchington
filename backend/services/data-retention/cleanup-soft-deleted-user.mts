import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import {
  lockAuthorPublicationLifecycle,
  recordAuthorDeletionBeforePostReassignment,
} from '@services/post-publication'
import { DELETED_USER_ID } from '@services/users/constants'
import sql from 'sql-template-strings'
import {
  detachProviderMembershipSources,
  releaseMembershipLineageBindings,
} from './cleanup-membership-lineage.mts'
import { pseudonymizeIdentityVerificationAttempts } from './pseudonymize-identity-verification-attempts.mts'
import { terminateRetainedMembershipGrants } from './terminate-retained-membership-grants.mts'

export async function cleanupSoftDeletedUser(
  targetId: string,
  cutoffDate: Date,
  lowerBoundDate?: Date,
): Promise<number> {
  await using query = await beginTransaction()
  await query(sql`/* cleanupSoftDeletedUserBatch:lockUser */
    SELECT pg_advisory_xact_lock(hashtextextended(${targetId}, 0))
  `)
  await lockAuthorPublicationLifecycle(query, targetId)
  if (
    !(await lockEligibleSoftDeletedUserForFinalPurge(query, targetId, cutoffDate, lowerBoundDate))
  ) {
    await query.commit()
    return 0
  }
  await recordAuthorDeletionBeforePostReassignment(query, targetId)
  await Promise.all([
    query(sql`/* cleanupSoftDeletedUserBatch: reassign crm contacts */
        UPDATE crm_contacts SET created_by_id = ${DELETED_USER_ID}
        WHERE created_by_id = ${targetId}`),
    query(sql`/* cleanupSoftDeletedUserBatch: reassign crm note authors */
        UPDATE conversation_messages SET created_by_id = ${DELETED_USER_ID}
        WHERE kind = 'note' AND created_by_id = ${targetId}`),
    query(sql`/* cleanupSoftDeletedUserBatch: reassign hashtag contributors */
        UPDATE post_topic_alias_sources SET contributor_id = ${DELETED_USER_ID}
        WHERE contributor_id = ${targetId}`),
    query(sql`/* cleanupSoftDeletedUserBatch: preserve topics */
        UPDATE topics SET created_by_id = ${DELETED_USER_ID} WHERE created_by_id = ${targetId}`),
    pseudonymizeIdentityVerificationAttempts(query, [targetId]),
    releaseMembershipLineageBindings(query, targetId),
    terminateRetainedMembershipGrants(query, targetId),
  ])
  await Promise.all([
    query(sql`/* cleanupSoftDeletedUserBatch: reassign verified identities */
        UPDATE verified_identities SET user_id = ${DELETED_USER_ID},
          revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE user_id = ${targetId}`),
    query(sql`/* cleanupSoftDeletedUserBatch: reassign identity transfers */
        UPDATE verified_identities SET transferred_to_user_id = ${DELETED_USER_ID}
        WHERE transferred_to_user_id = ${targetId}`),
  ])
  const { rowCount } = await query(sql`/* cleanupSoftDeletedUserBatch:delete */
      DELETE FROM users WHERE id = ${targetId}`)
  await detachProviderMembershipSources(query, targetId)
  await query.commit()
  return rowCount ?? 0
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
