import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
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
