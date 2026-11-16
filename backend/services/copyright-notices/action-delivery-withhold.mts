import type { LockedCopyrightActionDelivery } from './action-delivery-locking-types.mts'
import { beginTransaction } from '@data-stores/psql'
import type { CopyrightImagePlacement } from '@services/images/placements'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'
import { denyRestoreThenComplete } from './action-delivery-denial.mts'
import { completeCopyrightActionIntentInTransaction } from './action-delivery-state.mts'

export async function prepublishWithholdIfNeeded(input: {
  legal: LockedCopyrightActionDelivery
  placement: CopyrightImagePlacement
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<void> {
  if (
    input.placement.withheld ||
    input.placement.revision !== input.legal.expected_placement_revision
  )
    return
  await prepublishCopyrightImagePlacementDenial(
    {
      placementId: input.placement.placementId,
      revision: input.placement.revision,
      imageId: input.placement.imageId,
    },
    { query: input.query },
  )
}

/**
 * Completes a blocked intent. A placement this restore already made public is denied again
 * with a receipted legal-removal eviction; otherwise the outcome commits directly.
 */
export async function completeBlockedCopyrightAction(input: {
  intentId: string
  leaseToken: string
  legal: LockedCopyrightActionDelivery
  placement: CopyrightImagePlacement
  now: Date
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<'blocked' | 'not_claimed'> {
  const failureMessage =
    'A current copyright restriction, review, deadline, or legal hold blocks this transition.'
  if (input.legal.action === 'restore' && !input.placement.deleted && !input.placement.withheld) {
    const result = await denyRestoreThenComplete({
      intentId: input.intentId,
      leaseToken: input.leaseToken,
      tuple: {
        placementId: input.placement.placementId,
        revision: input.placement.revision,
        imageId: input.placement.imageId,
      },
      outcome: 'blocked',
      completedAt: input.now,
      failureMessage,
      transaction: input.query,
    })
    return result === 'completed' ? 'blocked' : 'not_claimed'
  }
  await completeCopyrightActionIntentInTransaction({
    intentId: input.intentId,
    leaseToken: input.leaseToken,
    outcome: 'blocked',
    completedAt: input.now,
    failureMessage,
    query: input.query,
  })
  await input.query.commit()
  return 'blocked'
}

/** A queued withhold cannot recreate a legal ground whose restoration already committed. */
export async function completeLiftedCopyrightWithhold(input: {
  intentId: string
  legal: LockedCopyrightActionDelivery
  now: Date
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<'stale'> {
  await completeCopyrightActionIntentInTransaction({
    intentId: input.intentId,
    leaseToken: input.legal.lease_token,
    outcome: 'stale',
    completedAt: input.now,
    failureMessage: 'The copyright restriction was lifted before its withhold delivery began.',
    query: input.query,
  })
  await input.query.commit()
  return 'stale'
}
