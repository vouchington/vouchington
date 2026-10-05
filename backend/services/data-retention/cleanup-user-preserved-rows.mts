import type { TransactionQuery } from '@data-stores/psql'
import { DELETED_USER_ID } from '@services/users/constants'
import sql from 'sql-template-strings'
import {
  detachProviderMembershipSources,
  releaseMembershipLineageBindings,
} from './cleanup-membership-lineage.mts'
import { pseudonymizeIdentityVerificationAttempts } from './pseudonymize-identity-verification-attempts.mts'
import { terminateRetainedMembershipGrants } from './terminate-retained-membership-grants.mts'

import type { RetentionWorkBudget } from './work-budget.mts'

/** All independent mutation-backed candidate pages share the job's remaining row allowance. */
export async function cleanupUserPreservedRows(
  query: TransactionQuery,
  userId: string,
  batchSize: number,
  budget: RetentionWorkBudget,
): Promise<boolean> {
  const stages = [
    async (limit: number) => {
      // no-mistakes-disable-next-line postgres-required-predicates: reassign every topic the purged user created, including deleted and merged ones, or deleting the user cascades into them
      const { rowCount } = await query(sql`/* cleanupSoftDeletedUserBatch: preserve topics */
        WITH candidates AS (SELECT id FROM topics WHERE created_by_id = ${userId}
          ORDER BY id LIMIT ${limit} FOR UPDATE)
        UPDATE topics SET created_by_id = ${DELETED_USER_ID} WHERE id IN (SELECT id FROM candidates)`)
      return rowCount ?? 0
    },
    (limit: number) => pseudonymizeIdentityVerificationAttempts(query, [userId], limit),
    (limit: number) => releaseMembershipLineageBindings(query, userId, limit),
    (limit: number) => terminateRetainedMembershipGrants(query, userId, limit),
    async (limit: number) => {
      const { rowCount } =
        await query(sql`/* cleanupSoftDeletedUserBatch: reassign verified identities */
        WITH candidates AS (SELECT id FROM verified_identities WHERE user_id = ${userId}
          ORDER BY id LIMIT ${limit} FOR UPDATE)
        UPDATE verified_identities SET user_id = ${DELETED_USER_ID},
          revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE id IN (SELECT id FROM candidates)`)
      return rowCount ?? 0
    },
    async (limit: number) => {
      const { rowCount } =
        await query(sql`/* cleanupSoftDeletedUserBatch: reassign identity transfers */
        WITH candidates AS (SELECT id FROM verified_identities WHERE transferred_to_user_id = ${userId}
          ORDER BY id LIMIT ${limit} FOR UPDATE)
        UPDATE verified_identities SET transferred_to_user_id = ${DELETED_USER_ID}
          WHERE id IN (SELECT id FROM candidates)`)
      return rowCount ?? 0
    },
    async (limit: number) => {
      // Projections precede source detachment: their composite FK still names the live user.
      const { rowCount } =
        await query(sql`/* cleanupSoftDeletedUserBatch: remove membership projections */
        WITH candidates AS (SELECT id FROM memberships WHERE user_id = ${userId}
          ORDER BY id LIMIT ${limit} FOR UPDATE)
        DELETE FROM memberships WHERE id IN (SELECT id FROM candidates)`)
      return rowCount ?? 0
    },
    (limit: number) => detachProviderMembershipSources(query, userId, limit),
  ]
  for (const stage of stages) {
    if (budget.remainingRows === 0) return true
    const limit = Math.min(batchSize, budget.remainingRows)
    // oxlint-disable-next-line no-await-in-loop -- later candidate pages share the remaining allowance and lifecycle order.
    const processed = await stage(limit)
    budget.remainingRows -= processed
    if (processed === limit) return true
  }
  return budget.remainingRows === 0
}
