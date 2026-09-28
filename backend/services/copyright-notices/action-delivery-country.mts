import type { beginTransaction } from '@data-stores/psql'
import { runSequentially } from '@modules/utils/run-sequentially'
import { stageImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import type { CopyrightImagePlacement } from '@services/images/placements'
import { resolveCopyrightDeadlineIfComplete } from './action-delivery-finalization.mts'
import { authorizeRestoreBeforeDelivery } from './action-delivery-restore.mts'
import {
  completeCopyrightActionIntentInTransaction,
  hasCopyrightActionBlocker,
  insertCopyrightActionLifecycleEvent,
  liftCopyrightRestrictionInTransaction,
  type LockedCopyrightActionDelivery,
} from './action-delivery-state.mts'

type Query = Awaited<ReturnType<typeof beginTransaction>>

/** Country grounds stay on the neutral placement URL. Global withholding is a different fact. */
export async function finishCountryScopedCopyrightAction(input: {
  intentId: string
  legal: LockedCopyrightActionDelivery
  placement: CopyrightImagePlacement
  now: Date
  query: Query
}): Promise<
  | 'applied'
  | 'blocked'
  | {
      legal: LockedCopyrightActionDelivery
      placement: CopyrightImagePlacement
      deliveryKey: string
    }
> {
  if (await hasCopyrightActionBlocker(input.legal, input.now, input.query)) {
    await completeCopyrightActionIntentInTransaction({
      intentId: input.intentId,
      outcome: 'blocked',
      completedAt: input.now,
      failureMessage:
        'A current copyright restriction, review, deadline, or legal hold blocks this transition.',
      query: input.query,
    })
    return 'blocked'
  }
  if (input.legal.action === 'restore' && input.placement.withheld) {
    await retainGlobalPlacement(input)
    return 'applied'
  }
  if (input.legal.action === 'restore') {
    await authorizeRestoreBeforeDelivery({
      legal: input.legal,
      intentId: input.intentId,
      now: input.now,
      query: input.query,
    })
  }
  const staged = await stageImagePlacementDeliveryRecord(
    {
      placementId: input.placement.placementId,
      revision: input.placement.revision,
      imageId: input.placement.imageId,
      state: 'allow',
    },
    { query: input.query },
  )
  return { legal: input.legal, placement: input.placement, deliveryKey: staged.deliveryKey }
}

async function retainGlobalPlacement(input: {
  intentId: string
  legal: LockedCopyrightActionDelivery
  now: Date
  query: Query
}): Promise<void> {
  await runSequentially([
    () =>
      liftCopyrightRestrictionInTransaction(
        input.legal.copyright_restriction_id,
        input.now,
        input.query,
      ),
    () =>
      resolveCopyrightDeadlineIfComplete(
        input.legal.copyright_notice_deadline_id,
        input.now,
        input.query,
      ),
    () =>
      completeCopyrightActionIntentInTransaction({
        intentId: input.intentId,
        outcome: 'completed',
        completedAt: input.now,
        query: input.query,
      }),
    () =>
      insertCopyrightActionLifecycleEvent(
        input.legal,
        input.intentId,
        'restriction_lifted_placement_retained',
        input.query,
      ),
  ])
}
