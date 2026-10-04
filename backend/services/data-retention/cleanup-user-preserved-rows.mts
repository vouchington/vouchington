import type { QueryExecutor } from '@data-stores/psql'
import { DELETED_USER_ID } from '@services/users/constants'
import sql from 'sql-template-strings'
import {
  detachProviderMembershipSources,
  releaseMembershipLineageBindings,
} from './cleanup-membership-lineage.mts'
import { pseudonymizeIdentityVerificationAttempts } from './pseudonymize-identity-verification-attempts.mts'
import { terminateRetainedMembershipGrants } from './terminate-retained-membership-grants.mts'

/** Mutation-backed pages must finish before the live user parent is removed. */
export async function cleanupUserPreservedRows(
  query: QueryExecutor,
  userId: string,
  batchSize: number,
): Promise<boolean> {
  const progress = await Promise.all([
    query(sql`/* cleanupSoftDeletedUserBatch: preserve topics */
      WITH candidates AS (SELECT id FROM topics WHERE created_by_id = ${userId}
        ORDER BY id LIMIT ${batchSize} FOR UPDATE)
      UPDATE topics SET created_by_id = ${DELETED_USER_ID} WHERE id IN (SELECT id FROM candidates)`).then(
      result => result.rowCount === batchSize,
    ),
    pseudonymizeIdentityVerificationAttempts(query, [userId], batchSize),
    releaseMembershipLineageBindings(query, userId, batchSize),
    terminateRetainedMembershipGrants(query, userId, batchSize),
  ])
  if (progress.some(Boolean)) return true
  const identities = await Promise.all([
    query(sql`/* cleanupSoftDeletedUserBatch: reassign verified identities */
      WITH candidates AS (SELECT id FROM verified_identities WHERE user_id = ${userId}
        ORDER BY id LIMIT ${batchSize} FOR UPDATE)
      UPDATE verified_identities SET user_id = ${DELETED_USER_ID},
        revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id IN (SELECT id FROM candidates)`).then(
      result => result.rowCount === batchSize,
    ),
    query(sql`/* cleanupSoftDeletedUserBatch: reassign identity transfers */
      WITH candidates AS (SELECT id FROM verified_identities WHERE transferred_to_user_id = ${userId}
        ORDER BY id LIMIT ${batchSize} FOR UPDATE)
      UPDATE verified_identities SET transferred_to_user_id = ${DELETED_USER_ID}
        WHERE id IN (SELECT id FROM candidates)`).then(result => result.rowCount === batchSize),
  ])
  if (identities.some(Boolean)) return true
  // Projections must go first: their composite FK still names the source's live user.
  const { rowCount } =
    await query(sql`/* cleanupSoftDeletedUserBatch: remove membership projections */
    WITH candidates AS (SELECT id FROM memberships WHERE user_id = ${userId}
      ORDER BY id LIMIT ${batchSize} FOR UPDATE)
    DELETE FROM memberships WHERE id IN (SELECT id FROM candidates)`)
  if (rowCount === batchSize) return true
  return detachProviderMembershipSources(query, userId, batchSize)
}
