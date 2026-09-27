import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { resolveCopyrightLegalHoldInTransaction } from '../../../services/copyright-notices/hold-resolution.mts'
import { lockCopyrightNoticeHoldPlacements } from '../../../services/copyright-notices/hold-placement-locks.mts'
import { replayFailedCopyrightActionIntent } from '../../../services/copyright-notices/action-delivery-state.mts'
import { replayEligibleCopyrightRestoreIntentsInTransaction } from '../../../services/copyright-notices/court-hold-restore-replay.mts'
import {
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '../../postgres-lock-wait.mts'

/** Reproduces the pre-fix committed resolution with no intent reset, without changing original authority. */
export async function recordHistoricalTestCopyrightHoldResolution(input: {
  assessmentId: string
  resolvedAt: Date
  actorId: string
}): Promise<void> {
  await write(sql`/* recordHistoricalTestCopyrightHoldResolution */
    INSERT INTO copyright_notice_legal_hold_resolutions (
      copyright_notice_legal_hold_assessment_id, resolved_at, resolved_by_id, resolution_kind, rationale_ciphertext
    ) VALUES (${input.assessmentId}, ${input.resolvedAt}, ${input.actorId}, 'dismissed',
      ${encryptSecret('Historical resolution', `copyright-legal-hold-resolution:${input.assessmentId}`)})
  `)
}

/** Exercises the actual transaction-owned legal transition, then rolls back its resolution/reset/audit. */
export async function rollbackTestCopyrightHoldResolution(
  input: Parameters<typeof resolveCopyrightLegalHoldInTransaction>[0],
): Promise<string[]> {
  await using transaction = await beginTransaction()
  const result = await resolveCopyrightLegalHoldInTransaction(input, transaction)
  return result.intentIds
}

/** Returns exactly the committed intent IDs the public resolution will enqueue. */
export async function commitTestCopyrightHoldResolution(
  input: Parameters<typeof resolveCopyrightLegalHoldInTransaction>[0],
): Promise<string[]> {
  await using transaction = await beginTransaction()
  const result = await resolveCopyrightLegalHoldInTransaction(input, transaction)
  await transaction.commit()
  return result.intentIds
}

/** Supplies an owned candidate directly, proving the locked automatic replay rechecks its state. */
export async function replayTestAutomaticCopyrightRestore(input: {
  noticeId: string
  intentId: string
  now: Date
}): Promise<string[]> {
  await using transaction = await beginTransaction()
  await lockCopyrightNoticeHoldPlacements(input.noticeId, transaction)
  await transaction(sql`SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE`)
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
    await transaction(sql`SELECT id FROM copyright_notices WHERE id = ${input.noticeId} FOR UPDATE`)
    const pid = await getTestPostgresBackendProcessId(transaction)
    replay = replayFailedCopyrightActionIntent(input)
    await waitForTestPostgresLockWaiter(pid, 'replayFailedCopyrightActionIntent:placementLock')
    await transaction(
      sql`SELECT id FROM copyright_notice_action_intents WHERE id = ${input.intentId} FOR UPDATE NOWAIT`,
    )
    await transaction.commit()
  }
  return replay
}

export async function cancelTestCopyrightRestorationDeadline(deadlineId: string): Promise<void> {
  await write(
    sql`UPDATE copyright_notice_deadlines SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ${deadlineId}`,
  )
}

export async function quarantineTestCopyrightRestorationImage(imageId: string): Promise<void> {
  await write(
    sql`UPDATE images SET quarantine_pending_at = CURRENT_TIMESTAMP WHERE id = ${imageId}`,
  )
}

export async function makeTestCopyrightRestorationImageUnready(imageId: string): Promise<void> {
  await write(sql`UPDATE images SET openai_omni_moderation_created_at = NULL WHERE id = ${imageId}`)
}

export async function retireTestCopyrightRestorationPlacement(placementKey: string): Promise<void> {
  await write(sql`UPDATE media_placements SET retired_at = CURRENT_TIMESTAMP, retirement_reason = 'owner_removed', revision = revision + 1
    WHERE concat('image-placement:', id) = ${placementKey}`)
}

export async function supersedeTestCopyrightRestorationPlacementRevision(
  placementKey: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`UPDATE media_placements SET revision = revision + 1, copyright_withheld_at = NULL
    WHERE concat('image-placement:', id) = ${placementKey}`)
  await transaction(sql`UPDATE media_placements SET revision = revision + 1, copyright_withheld_at = CURRENT_TIMESTAMP
    WHERE concat('image-placement:', id) = ${placementKey}`)
  await transaction.commit()
}
