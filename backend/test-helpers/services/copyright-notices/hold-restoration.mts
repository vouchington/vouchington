import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { lockCopyrightNoticeHoldPlacements } from '../../../services/copyright-notices/hold-placement-locks.mts'
import { replayFailedCopyrightActionIntent } from '../../../services/copyright-notices/action-delivery-state.mts'
import { replayEligibleCopyrightRestoreIntentsInTransaction } from '../../../services/copyright-notices/court-hold-restore-replay.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '../../postgres-lock-wait.mts'

/** Supplies an owned candidate directly, proving the locked automatic replay rechecks its state. */
export async function replayTestAutomaticCopyrightRestore(input: {
  noticeId: string
  intentId: string
  now: Date
}): Promise<string[]> {
  await using transaction = await beginTransaction()
  await lockCopyrightNoticeHoldPlacements(input.noticeId, transaction)
  await transaction(
    sql`/* replayTestAutomaticCopyrightRestore */ SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE`,
  )
  return await replayEligibleCopyrightRestoreIntentsInTransaction({
    noticeId: input.noticeId,
    intentIds: [input.intentId],
    now: input.now,
    query: transaction,
  })
}

/** Proves manual replay waits at the placement fence while its intent row remains independently lockable. */
export async function replayTestFailedCopyrightActionBehindHoldFence(input: {
  intentId: string
  noticeId: string
  actorUserId: string
}): Promise<boolean> {
  let replay: Promise<boolean>
  {
    await using transaction = await beginTransaction()
    await lockCopyrightNoticeHoldPlacements(input.noticeId, transaction)
    await transaction(
      sql`/* replayTestFailedCopyrightActionBehindHoldFence */ SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE`,
    )
    const pid = await getTestPostgresBackendProcessId(transaction)
    replay = replayFailedCopyrightActionIntent(input)
    await waitForTestPostgresLockWaiter(pid, 'replayFailedCopyrightActionIntent:placementLock')
    await transaction(
      sql`/* replayTestFailedCopyrightActionBehindHoldFence */ SELECT id FROM copyright_notice_action_work_items WHERE id = ${input.intentId} FOR UPDATE NOWAIT`,
    )
    await transaction.commit()
  }
  return replay
}

export async function cancelTestCopyrightRestorationDeadline(deadlineId: string): Promise<void> {
  await write(
    allowUnannotatedQuery(
      sql`UPDATE copyright_notice_deadlines SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ${deadlineId}`,
    ),
  )
}

export async function quarantineTestCopyrightRestorationImage(imageId: string): Promise<void> {
  await write(
    allowUnannotatedQuery(
      sql`UPDATE images SET quarantine_pending_at = CURRENT_TIMESTAMP WHERE id = ${imageId}`,
    ),
  )
}

export async function makeTestCopyrightRestorationImageUnready(imageId: string): Promise<void> {
  await write(
    allowUnannotatedQuery(
      sql`UPDATE images SET openai_omni_moderation_created_at = NULL WHERE id = ${imageId}`,
    ),
  )
}

export async function retireTestCopyrightRestorationPlacement(placementId: string): Promise<void> {
  await write(
    allowUnannotatedQuery(sql`UPDATE media_placements SET retired_at = CURRENT_TIMESTAMP, retirement_reason = 'owner_removed', revision = revision + 1
    WHERE id = ${placementId}`),
  )
}

export async function supersedeTestCopyrightRestorationPlacementRevision(
  placementId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    allowUnannotatedQuery(sql`UPDATE media_placements SET revision = revision + 1, copyright_withheld_at = CASE WHEN copyright_withheld_at IS NULL THEN clock_timestamp() ELSE NULL END
    WHERE id = ${placementId}`),
  )
  await transaction(
    allowUnannotatedQuery(sql`UPDATE media_placements SET revision = revision + 1, copyright_withheld_at = CASE WHEN copyright_withheld_at IS NULL THEN clock_timestamp() ELSE NULL END
    WHERE id = ${placementId}`),
  )
  await transaction.commit()
}
