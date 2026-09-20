import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import { resolveCopyrightDeadlineIfComplete } from './action-delivery-finalization.mts'
import {
  completeCopyrightActionIntentInTransaction,
  insertCopyrightActionLifecycleEvent,
  liftCopyrightRestrictionInTransaction,
  type LockedCopyrightActionDelivery,
} from './action-delivery-state.mts'

export async function completeUnavailableRestore(input: {
  intentId: string
  legal: LockedCopyrightActionDelivery
  now: Date
  query: Awaited<ReturnType<typeof beginTransaction>>
  dependencies: CopyrightActionDeliveryDependencies
}): Promise<void> {
  await input.dependencies.clearUnavailableImagePlacementCopyrightWithholding(
    input.legal.placement_key,
    {
      query: input.query,
    },
  )
  await liftCopyrightRestrictionInTransaction(
    input.legal.copyright_restriction_id,
    input.now,
    input.query,
  )
  await resolveCopyrightDeadlineIfComplete(
    input.legal.copyright_notice_deadline_id,
    input.now,
    input.query,
  )
  await completeCopyrightActionIntentInTransaction({
    intentId: input.intentId,
    outcome: 'completed',
    completedAt: input.now,
    failureMessage: 'Restoration resolved without delivery because the placement is unavailable.',
    query: input.query,
  })
  await insertCopyrightActionLifecycleEvent(
    input.legal,
    input.intentId,
    'restoration_unavailable',
    input.query,
  )
}

export async function completeRestoreRetainingPlacement(input: {
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
      WHERE other_target.placement_key = ${input.legal.placement_key}
        AND other_restriction.lifted_at IS NULL
        AND other_restriction.id <> ${input.legal.copyright_restriction_id}
    ) AS blocked
  `)
  if (!rows[0]?.blocked) return false
  await liftCopyrightRestrictionInTransaction(
    input.legal.copyright_restriction_id,
    input.now,
    input.query,
  )
  await resolveCopyrightDeadlineIfComplete(
    input.legal.copyright_notice_deadline_id,
    input.now,
    input.query,
  )
  await completeCopyrightActionIntentInTransaction({
    intentId: input.intentId,
    outcome: 'completed',
    completedAt: input.now,
    query: input.query,
  })
  await insertCopyrightActionLifecycleEvent(
    input.legal,
    input.intentId,
    'restriction_lifted_placement_retained',
    input.query,
  )
  return true
}

export async function authorizeRestoreBeforeDelivery(input: {
  legal: LockedCopyrightActionDelivery
  intentId: string
  now: Date
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<void> {
  await liftCopyrightRestrictionInTransaction(
    input.legal.copyright_restriction_id,
    input.now,
    input.query,
  )
  await resolveCopyrightDeadlineIfComplete(
    input.legal.copyright_notice_deadline_id,
    input.now,
    input.query,
  )
  await insertCopyrightActionLifecycleEvent(
    input.legal,
    input.intentId,
    'restoration_authorized_pending_delivery',
    input.query,
  )
}
