import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { withTestOwnedPostgresWait } from '../../postgres-client-lock-observer.mts'
import { lockCopyrightNoticeHoldPlacements } from '../../../services/copyright-notices/hold-placement-locks.mts'
import { replayFailedCopyrightActionIntent } from '../../../services/copyright-notices/action-delivery-state.mts'
import { replayEligibleCopyrightRestoreIntentsInTransaction } from '../../../services/copyright-notices/court-hold-restore-replay.mts'
import { getTestPostgresBackendProcessId } from '../../postgres-lock-wait.mts'

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
  await using transaction = await beginTransaction()
  await lockCopyrightNoticeHoldPlacements(input.noticeId, transaction)
  await transaction(
    sql`/* replayTestFailedCopyrightActionBehindHoldFence */ SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE`,
  )
  const { rows: targets } = await transaction<{ placement_id: string }>(sql`
    /* replayTestFailedCopyrightActionBehindHoldFence:placement */
    SELECT target.placement_id FROM copyright_notice_action_work_items work
    JOIN copyright_restrictions restriction ON restriction.id = work.copyright_restriction_id
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE work.id = ${input.intentId} AND target.copyright_notice_id = ${input.noticeId}
  `)
  if (targets.length !== 1 || !targets[0])
    throw new Error('Copyright replay fixture did not resolve one held placement')
  const pid = await getTestPostgresBackendProcessId(transaction)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId: pid,
      pool: 'write',
      lock: { kind: 'advisory', key: `image-placement:${targets[0].placement_id}` },
      queryMarker: 'replayFailedCopyrightActionIntent:placementLock',
      releaseHolder: () => transaction[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const replay = replayFailedCopyrightActionIntent(input)
      await waitForLock(replay)
      await transaction(
        sql`/* replayTestFailedCopyrightActionBehindHoldFence */ SELECT id FROM copyright_notice_action_work_items WHERE id = ${input.intentId} FOR UPDATE NOWAIT`,
      )
      await transaction.commit()
      return replay
    },
  )
}

export async function cancelTestCopyrightRestorationDeadline(deadlineId: string): Promise<void> {
  await write(
    sql`/* cancelTestCopyrightRestorationDeadline */ UPDATE copyright_notice_deadlines SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ${deadlineId}`,
  )
}

export async function quarantineTestCopyrightRestorationImage(imageId: string): Promise<void> {
  await write(
    sql`/* quarantineTestCopyrightRestorationImage */ UPDATE images SET quarantine_pending_at = CURRENT_TIMESTAMP WHERE id = ${imageId}`,
  )
}

export async function makeTestCopyrightRestorationImageUnready(imageId: string): Promise<void> {
  await write(
    sql`/* makeTestCopyrightRestorationImageUnready */ UPDATE images SET openai_omni_moderation_created_at = NULL WHERE id = ${imageId}`,
  )
}

export async function retireTestCopyrightRestorationPlacement(placementId: string): Promise<void> {
  await write(
    sql`/* retireTestCopyrightRestorationPlacement */ UPDATE media_placements SET retired_at = CURRENT_TIMESTAMP, retirement_reason = 'owner_removed', revision = revision + 1
    WHERE id = ${placementId}`,
  )
}

export async function supersedeTestCopyrightRestorationPlacementRevision(
  placementId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    sql`/* supersedeTestCopyrightRestorationPlacementRevision:firstToggle */ UPDATE media_placements SET revision = revision + 1, copyright_withheld_at = CASE WHEN copyright_withheld_at IS NULL THEN clock_timestamp() ELSE NULL END
    WHERE id = ${placementId}`,
  )
  await transaction(
    sql`/* supersedeTestCopyrightRestorationPlacementRevision:secondToggle */ UPDATE media_placements SET revision = revision + 1, copyright_withheld_at = CASE WHEN copyright_withheld_at IS NULL THEN clock_timestamp() ELSE NULL END
    WHERE id = ${placementId}`,
  )
  await transaction.commit()
}
