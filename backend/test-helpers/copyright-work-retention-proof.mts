import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { claimCopyrightActionIntent } from '../services/copyright-notices/action-delivery-state.mts'
import { liftCopyrightRestrictionInTransaction } from '../services/copyright-notices/action-delivery-locking.mts'

export async function prepareCopyrightBlockedWorkProof(intentId: string, restrictionId: string) {
  await using transaction = await beginTransaction()
  await transaction(sql`/* prepareCopyrightBlockedWorkProof */
    UPDATE copyright_notice_action_work_items
    SET completed_at = clock_timestamp(), completed_at_reason = 'blocked', available_at = NULL
    WHERE id = ${intentId} AND state = 'pending'
  `)
  await liftCopyrightRestrictionInTransaction(restrictionId, new Date(), transaction)
  await transaction.commit()
}

/** Isolate work-state proof invalidation from the additional lifecycle clock used by replay services. */
export async function reopenCopyrightWorkProof(intentId: string) {
  await write(sql`/* reopenCopyrightWorkProof */
    UPDATE copyright_notice_action_work_items
    SET completed_at = NULL, completed_at_reason = NULL, leased_at = NULL,
      attempt_count = 0, available_at = clock_timestamp()
    WHERE id = ${intentId} AND state = 'blocked'
  `)
}

export async function prepareCopyrightLastActionAttempt(intentId: string, restrictionId: string) {
  let claimed: Awaited<ReturnType<typeof claimCopyrightActionIntent>> = null
  for (let attempt = 0; attempt < 5; attempt++) {
    claimed = await claimCopyrightActionIntent(intentId, new Date('2100-01-01T00:00:00.000Z'))
    if (!claimed) throw new Error('Owned action did not reach its terminal attempt')
  }
  await using transaction = await beginTransaction()
  await liftCopyrightRestrictionInTransaction(restrictionId, new Date(), transaction)
  await transaction.commit()
  return claimed!
}

/** Committed terminal failure for a sweep subject; the failure writer is tested separately. */
export async function prepareCopyrightFailedWorkProof(intentId: string, restrictionId: string) {
  await using transaction = await beginTransaction()
  for (let attempt = 0; attempt < 5; attempt++) {
    await transaction(sql`/* prepareCopyrightFailedWorkProof:claim */
      UPDATE copyright_notice_action_work_items SET attempt_count = attempt_count + 1,
        leased_at = clock_timestamp(), lease_token = uuidv7(), lease_expires_at = NULL
      WHERE id = ${intentId}`)
  }
  await transaction(sql`/* prepareCopyrightFailedWorkProof */
    UPDATE copyright_notice_action_work_items SET completed_at = clock_timestamp(),
      completed_at_reason = 'failed', failure_message = 'Committed terminal provider failure.',
      available_at = NULL WHERE id = ${intentId}`)
  await liftCopyrightRestrictionInTransaction(restrictionId, new Date(), transaction)
  await transaction.commit()
}
