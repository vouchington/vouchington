import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { replayEligibleCopyrightRestoreIntentsInTransaction } from '../../../services/copyright-notices/court-hold-restore-replay.mts'

/** Supplies an owned candidate directly, proving the locked automatic replay rechecks its state. */
export async function replayTestAutomaticCopyrightRestore(input: {
  noticeId: string
  intentId: string
  now: Date
}): Promise<string[]> {
  await using transaction = await beginTransaction()
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

export async function cancelTestCopyrightRestorationDeadline(deadlineId: string): Promise<void> {
  await write(
    sql`/* cancelTestCopyrightRestorationDeadline */ UPDATE copyright_notice_deadlines SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ${deadlineId}`,
  )
}

export async function quarantineTestCopyrightRestorationImage(imageId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(
    sql`/* quarantineTestCopyrightRestorationImage */ UPDATE images SET quarantine_pending_at = CURRENT_TIMESTAMP WHERE id = ${imageId}`,
  )
  await query.commit()
}

export async function makeTestCopyrightRestorationImageUnready(imageId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(
    sql`/* makeTestCopyrightRestorationImageUnready */ UPDATE images SET openai_omni_moderation_created_at = NULL WHERE id = ${imageId}`,
  )
  await query.commit()
}

export async function retireTestCopyrightRestorationPlacement(placementId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* retireTestCopyrightRestorationPlacement */
    UPDATE media_placements SET retired_at = CURRENT_TIMESTAMP,
      retirement_reason = 'owner_removed', revision = revision + 1 WHERE id = ${placementId}`)
  await query.commit()
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
