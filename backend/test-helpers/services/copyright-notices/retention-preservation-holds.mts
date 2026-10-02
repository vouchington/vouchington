import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockCopyrightRetentionCase } from '../../../services/copyright-notices/retention-erasure-preservation.mts'
import {
  insertPreservationHoldForTest,
  releasePreservationHoldForTest,
} from '../../entities/user-legal-preservation-holds.mts'
import { blockMinimalCase } from './retention-blockers.mts'

/** A legal-process preservation hold on the account that posted the targeted work. */
export const createPreservedPosterCase = () =>
  blockMinimalCase(async entry => {
    const holdId = await insertPreservationHoldForTest(entry.posterId, entry.moderator.id)
    return () => releasePreservationHoldForTest(holdId, entry.moderator.id)
  })

/** A legal-process preservation hold on the signed-in claimant's account. */
export const createPreservedClaimantCase = () =>
  blockMinimalCase(
    async entry => {
      const holdId = await insertPreservationHoldForTest(entry.claimantId!, entry.moderator.id)
      return () => releasePreservationHoldForTest(holdId, entry.moderator.id)
    },
    { claimant: true },
  )

/** Releases a hold as of `releasedAt`, so a test can place the release after the case's own events. */
export async function releasePreservationHoldAt(
  holdId: string,
  releasedById: string,
  releasedAt: Date,
): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* releaseRetentionPreservationHoldAt */
    UPDATE user_legal_preservation_holds
    SET released_at = ${releasedAt}, released_by_id = ${releasedById} WHERE id = ${holdId}`)
  await query.commit()
}

/**
 * Whether another transaction could take the advisory lock that placing a hold on, and deleting,
 * the account both take. It is released at once, so `false` means someone else is holding it.
 */
export async function canLockAccountNow(userId: string): Promise<boolean> {
  await using query = await beginTransaction()
  const { rows } = await query<{ locked: boolean }>(sql`/* tryRetentionAccountLock */
    SELECT pg_try_advisory_xact_lock(hashtextextended(${userId}, 0)) AS locked`)
  return rows[0]?.locked ?? false
}

/**
 * An open transaction that has taken the party advisory locks and the notice row lock of a case the
 * way an erasure does. The locks stay held until the caller commits it or lets it go out of scope.
 */
export async function beginRetentionPartyLocks(noticeId: string) {
  const transaction = await beginTransaction()
  try {
    await lockCopyrightRetentionCase(transaction, noticeId)
  } catch (err) {
    await transaction[Symbol.asyncDispose]()
    throw err
  }
  return transaction
}
