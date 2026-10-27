import type { UserPurgeAfterCommit, UserPurgeCursor } from './user-purge-types.mts'
import { cleanupUserOwnedCommunities } from './cleanup-user-communities.mts'
import {
  cleanupUserListRows,
  cleanupUserNotifications,
  cleanupUserNotificationPushReceipts,
  cleanupUserNotificationPushIntents,
  cleanupUserCommunityMemberships,
} from './cleanup-user-cascade-rows.mts'
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
  cursor?: UserPurgeCursor,
): Promise<{ hasMore: boolean; userPurge?: UserPurgeCursor; afterCommit: UserPurgeAfterCommit[] }> {
  const afterCommit: UserPurgeAfterCommit[] = []
  if (budget.remainingRows === 0) return { hasMore: true, afterCommit }
  const community = await cleanupUserOwnedCommunities(
    query,
    userId,
    Math.min(batchSize, budget.remainingRows),
    cursor,
  )
  afterCommit.push(...community.afterCommit)
  budget.remainingRows -= community.processed
  if (community.userPurge) return { hasMore: true, userPurge: community.userPurge, afterCommit }
  if (community.processed > 0 || cursor) return { hasMore: true, afterCommit }
  const lists = await cleanupUserListRows(query, userId, Math.min(batchSize, budget.remainingRows))
  budget.remainingRows -= lists
  if (lists > 0) return { hasMore: true, afterCommit }
  const stages = [
    (limit: number) => cleanupUserNotificationPushReceipts(query, userId, limit),
    (limit: number) => cleanupUserNotificationPushIntents(query, userId, limit),
    (limit: number) => cleanupUserNotifications(query, userId, limit),
    (limit: number) => cleanupUserCommunityMemberships(query, userId, limit),
    async (limit: number) => {
      const { rowCount } = await query(sql`/* cleanupSoftDeletedUserBatch: preserve topics */
        -- no-mistakes-disable-next-line postgres-required-predicates: reassign every topic the purged user created, including deleted and merged ones, or deleting the user cascades into them
        WITH candidates AS (SELECT id FROM topics WHERE created_by_id = ${userId}
          ORDER BY id LIMIT ${limit} FOR UPDATE)
        UPDATE topics SET created_by_id = ${DELETED_USER_ID} WHERE id IN (SELECT id FROM candidates)`)
      return rowCount ?? 0
    },
    (limit: number) => pseudonymizeIdentityVerificationAttempts(query, [userId], limit),
    (limit: number) => releaseMembershipLineageBindings(query, userId, limit),
    (limit: number) => terminateRetainedMembershipGrants(query, userId, limit),
    async (_limit: number) => {
      const { rowCount } = await query(sql`/* cleanupSoftDeletedUserBatch: revoke identity link */
        WITH removed AS (
          DELETE FROM verified_identity_account_links WHERE user_id = ${userId}
          RETURNING identity_fingerprint
        )
        UPDATE verified_identities SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        WHERE identity_fingerprint IN (SELECT identity_fingerprint FROM removed)`)
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
    if (budget.remainingRows === 0) return { hasMore: true, afterCommit }
    const limit = Math.min(batchSize, budget.remainingRows)
    // oxlint-disable-next-line no-await-in-loop -- later candidate pages share the remaining allowance and lifecycle order.
    const processed = await stage(limit)
    budget.remainingRows -= processed
    if (processed === limit) return { hasMore: true, afterCommit }
  }
  return { hasMore: budget.remainingRows === 0, afterCommit }
}
