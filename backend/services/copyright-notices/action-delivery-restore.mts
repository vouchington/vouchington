import { beginTransaction } from '@data-stores/psql'
import { runSequentially } from '@modules/utils/run-sequentially'
import sql from 'sql-template-strings'
import { clearUnavailableImagePlacementCopyrightWithholding } from '@services/images/placement-copyright-resolution'
import { createCopyrightPosterNoticesInTransaction } from './restriction-poster-notices.mts'
import type { CopyrightRestorationOutcome } from './statement-of-reasons.mts'
import { resolveCopyrightDeadlineIfComplete } from './action-delivery-finalization.mts'
import {
  completeCopyrightActionIntentInTransaction,
  insertCopyrightActionLifecycleEvent,
  liftCopyrightRestrictionInTransaction,
  type LockedCopyrightActionDelivery,
} from './action-delivery-state.mts'
import { syncCopyrightIncidentsAfterStatutoryRestoreInTransaction } from './statutory-restoration-incidents.mts'

export async function completeUnavailableRestore(input: {
  intentId: string
  legal: LockedCopyrightActionDelivery
  now: Date
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<void> {
  await runSequentially([
    () =>
      insertCopyrightActionLifecycleEvent(
        input.legal,
        input.intentId,
        'restoration_unavailable',
        input.query,
      ),
    () =>
      clearUnavailableImagePlacementCopyrightWithholding(input.legal.placement_id, {
        query: input.query,
      }),
    () =>
      liftCopyrightRestrictionAndResolveDeadline({ ...input, restorationOutcome: 'unavailable' }),
    () =>
      completeCopyrightActionIntentInTransaction({
        intentId: input.intentId,
        leaseToken: input.legal.lease_token,
        outcome: 'completed',
        completedAt: input.now,
        failureMessage:
          'Restoration resolved without delivery because the placement is unavailable.',
        query: input.query,
      }),
    () => syncCopyrightIncidentsAfterStatutoryRestoreInTransaction(input.legal, input.query),
  ])
}

/** Reads the placement's other restrictions, then lifts this one. Two restores doing that at once
 * would each see the other still active and leave the placement withheld, so SSI aborts one and
 * its job retries. The lease-conditional completion rolls the lift back if the lease was lost. */
export async function retainRestoreWhenOtherRestrictionsActive(input: {
  intentId: string
  legal: LockedCopyrightActionDelivery
  now: Date
}): Promise<boolean> {
  await using query = await beginTransaction({ serializable: true })
  const retained = await completeRestoreRetainingPlacement({ ...input, query })
  await query.commit()
  return retained
}

async function completeRestoreRetainingPlacement(input: {
  intentId: string
  legal: LockedCopyrightActionDelivery
  now: Date
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<boolean> {
  const { rows } = await input.query<{ blocked: boolean }>(sql`
    /* processCopyrightActionIntent:otherActiveRestrictions */
    SELECT EXISTS (
      SELECT 1
      FROM copyright_restrictions other_restriction
      JOIN copyright_notice_targets other_target
        ON other_target.id = other_restriction.copyright_notice_target_id
      WHERE other_target.placement_id = ${input.legal.placement_id}
        AND other_restriction.lifted_at IS NULL
        AND other_restriction.id <> ${input.legal.copyright_restriction_id}
    ) AS blocked
  `)
  if (!rows[0]?.blocked) return false
  await runSequentially([
    () =>
      insertCopyrightActionLifecycleEvent(
        input.legal,
        input.intentId,
        'restriction_lifted_placement_retained',
        input.query,
      ),
    () =>
      liftCopyrightRestrictionAndResolveDeadline({ ...input, restorationOutcome: 'still_hidden' }),
    () =>
      completeCopyrightActionIntentInTransaction({
        intentId: input.intentId,
        leaseToken: input.legal.lease_token,
        outcome: 'completed',
        completedAt: input.now,
        query: input.query,
      }),
    () => syncCopyrightIncidentsAfterStatutoryRestoreInTransaction(input.legal, input.query),
  ])
  return true
}

export async function authorizeRestoreBeforeDelivery(input: {
  legal: LockedCopyrightActionDelivery
  intentId: string
  now: Date
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<void> {
  await insertCopyrightActionLifecycleEvent(
    input.legal,
    input.intentId,
    'restoration_authorized_pending_delivery',
    input.query,
  )
  await liftCopyrightRestrictionAndResolveDeadline({ ...input, restorationOutcome: 'visible' })
}

async function liftCopyrightRestrictionAndResolveDeadline(input: {
  restorationOutcome: CopyrightRestorationOutcome
  legal: LockedCopyrightActionDelivery
  now: Date
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<void> {
  await liftCopyrightRestrictionInTransaction(
    input.legal.copyright_restriction_id,
    input.now,
    input.query,
  )
  const { rows } = await input.query<{
    copyright_notice_target_id: string
  }>(sql`/* liftCopyrightRestrictionAndResolveDeadline:target */
    SELECT copyright_notice_target_id FROM copyright_restrictions WHERE id = ${input.legal.copyright_restriction_id}
  `)
  await createCopyrightPosterNoticesInTransaction(
    {
      noticeId: input.legal.copyright_notice_id,
      targetId: rows[0]!.copyright_notice_target_id,
      restrictionId: input.legal.copyright_restriction_id,
      event: 'restriction_ended',
      restorationOutcome: input.restorationOutcome,
      restorationCause: input.legal.reversal_by_administrator_lift
        ? 'administrator_lift'
        : input.legal.reversal_by_complaint
          ? 'complaint_reversed'
          : input.legal.reversal_by_appeal
            ? 'appeal_reversed'
            : input.legal.reversal_by_review
              ? 'review_reversed'
              : input.legal.hold_resolution_authorized
                ? 'hold_resolved'
                : 'counter_notice_window',
    },
    input.query,
  )
  await resolveCopyrightDeadlineIfComplete(
    input.legal.copyright_notice_deadline_id,
    input.now,
    input.query,
  )
}
