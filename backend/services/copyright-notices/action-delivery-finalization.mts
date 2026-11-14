import { beginTransaction } from '@data-stores/psql'
import { runSequentially } from '@modules/utils/run-sequentially'
import sql from 'sql-template-strings'
import { getImagePlacementForCopyright } from '@services/images/placements'
import { invalidateCopyrightLegalRemovalSurfaces } from './action-delivery-cache.mts'
import { denyRestoreThenComplete } from './action-delivery-denial.mts'
import {
  completeCopyrightActionIntentInTransaction,
  hasCopyrightActionBlocker,
  hasOtherActiveCopyrightRestrictions,
  insertCopyrightActionLifecycleEvent,
  lockCopyrightActionDelivery,
} from './action-delivery-state.mts'
import { syncCopyrightIncidentsAfterStatutoryRestoreInTransaction } from './statutory-restoration-incidents.mts'

/**
 * Completes a delivered action. `denied` means a restore was denied again here, with its
 * legal-removal eviction receipted; `stale` and `not_claimed` leave any denial to the caller.
 */
export async function finalizeCopyrightActionAfterDelivery(
  intentId: string,
  leaseToken: string,
  action: 'withhold' | 'restore',
  now: Date,
  deliveredTuple: { placementId: string; revision: number; imageId: string },
): Promise<'applied' | 'denied' | 'stale' | 'not_claimed'> {
  await using transaction = await beginTransaction()
  const legal = await lockCopyrightActionDelivery(intentId, leaseToken, transaction)
  if (!legal) {
    await transaction.commit()
    return 'not_claimed'
  }
  const current = await getImagePlacementForCopyright(legal.placement_id, {
    query: transaction,
  })
  if (action === 'withhold' && legal.restriction_lifted_at !== null) {
    await completeCopyrightActionIntentInTransaction({
      intentId,
      leaseToken,
      outcome: 'stale',
      completedAt: now,
      failureMessage:
        'The copyright restriction was lifted while its withhold delivery was pending.',
      query: transaction,
    })
    await transaction.commit()
    return 'stale'
  }
  const deny = (outcome: 'blocked' | 'stale', failureMessage: string, tuple = deliveredTuple) =>
    denyRestoreThenComplete({
      intentId,
      leaseToken,
      tuple,
      outcome,
      completedAt: now,
      failureMessage,
      transaction,
    }).then(result => (result === 'completed' ? 'denied' : 'not_claimed'))
  if (
    !current ||
    current.deleted ||
    current.imageId !== legal.image_id ||
    current.withheld !== (action === 'withhold')
  ) {
    const failureMessage = 'Placement changed while its exact delivery tuple was being projected.'
    // A live placement could have been refilled from the restored tuple before it changed.
    if (action === 'restore' && current && !current.deleted)
      return await deny('stale', failureMessage)
    await completeCopyrightActionIntentInTransaction({
      intentId,
      leaseToken,
      outcome: 'stale',
      completedAt: now,
      failureMessage,
      query: transaction,
    })
    await transaction.commit()
    return 'stale'
  }
  if (action === 'restore' && (await restoreIsBlocked(legal, now, transaction))) {
    return await deny(
      'blocked',
      'A current copyright blocker was admitted before restore delivery completed.',
      { placementId: current.placementId, revision: current.revision, imageId: current.imageId },
    )
  }
  await completeCopyrightActionAndInvalidate({
    intentId,
    action,
    now,
    legal,
    transaction,
  })
  await transaction.commit()
  return 'applied'
}

async function completeCopyrightActionAndInvalidate(input: {
  intentId: string
  action: 'withhold' | 'restore'
  now: Date
  legal: Parameters<typeof hasCopyrightActionBlocker>[0]
  transaction: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<void> {
  await runSequentially([
    () =>
      completeCopyrightActionIntentInTransaction({
        intentId: input.intentId,
        leaseToken: input.legal.lease_token,
        outcome: 'completed',
        completedAt: input.now,
        query: input.transaction,
      }),
    () => syncCopyrightIncidentsAfterStatutoryRestoreInTransaction(input.legal, input.transaction),
    () =>
      insertCopyrightActionLifecycleEvent(
        input.legal,
        input.intentId,
        input.action === 'withhold' ? 'placement_withheld' : 'placement_restored',
        input.transaction,
      ),
    () =>
      invalidateCopyrightLegalRemovalSurfaces(
        { placement_id: input.legal.placement_id, action: input.action },
        input.transaction,
      ),
  ])
}

export async function resolveCopyrightDeadlineIfComplete(
  deadlineId: string | null,
  now: Date,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  if (!deadlineId) return
  await query(sql`/* resolveCopyrightDeadlineIfComplete */
    UPDATE copyright_notice_deadlines deadline
    SET resolved_at = ${now}
    WHERE deadline.id = ${deadlineId}
      AND deadline.resolved_at IS NULL
      AND deadline.cancelled_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM copyright_notice_counter_notice_assessment_targets assessment_target
        JOIN copyright_restrictions restriction
          ON restriction.copyright_notice_target_id = assessment_target.copyright_notice_target_id
        WHERE assessment_target.copyright_notice_submission_assessment_identity_id = deadline.qualifying_counter_notice_assessment_identity_id
          AND restriction.lifted_at IS NULL
      )
  `)
}

async function restoreIsBlocked(
  legal: Parameters<typeof hasCopyrightActionBlocker>[0],
  now: Date,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<boolean> {
  return (
    (await hasCopyrightActionBlocker(legal, now, query)) ||
    (await hasOtherActiveCopyrightRestrictions(legal, query))
  )
}
