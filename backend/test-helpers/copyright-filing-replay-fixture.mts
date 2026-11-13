import { beginTransaction } from '@data-stores/psql'
import { preemptCopyrightRestorations } from '../services/copyright-notices/restore-preemption.mts'
import {
  replayEligibleCopyrightRestoreIntentsInTransaction,
  selectBlockedCopyrightRestoreIntentIds,
} from '../services/copyright-notices/court-hold-restore-replay.mts'

/** Complete preemption is a dependency of the real assessment/replay subject. */
export async function seedFilingBlockedRestore(noticeId: string) {
  await using transaction = await beginTransaction()
  await preemptCopyrightRestorations(noticeId, transaction)
  await transaction.commit()
}

/** A committed nonqualifying assessment precedes the independent real delivery subject. */
export async function seedAssessedFilingReplay(noticeId: string, now: Date) {
  await using query = await beginTransaction()
  await replayEligibleCopyrightRestoreIntentsInTransaction({
    noticeId,
    now,
    intentIds: await selectBlockedCopyrightRestoreIntentIds(noticeId, query),
    query,
  })
  await query.commit()
}
