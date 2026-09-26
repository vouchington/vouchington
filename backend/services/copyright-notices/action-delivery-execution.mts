import { beginTransaction } from '@data-stores/psql'
import { stageImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import { compensateCopyrightActionFailure } from './action-delivery-compensation.mts'
import {
  finalizeCopyrightActionAfterDelivery,
  lockCopyrightActionPlacement,
} from './action-delivery-finalization.mts'
import {
  completeCopyrightActionIntentInTransaction,
  getCopyrightActionPlacementKey,
  hasCopyrightActionBlocker,
  lockCopyrightActionDelivery,
  type CopyrightClaimedActionIntent,
} from './action-delivery-state.mts'
import {
  authorizeRestoreBeforeDelivery,
  completeRestoreRetainingPlacement,
  completeUnavailableRestore,
} from './action-delivery-restore.mts'
import {
  isCurrentPlacementForIntent,
  mutateCopyrightPlacement,
} from './action-delivery-mutation.mts'
import {
  prepublishWithholdIfNeeded,
  publishRestoreBlockerWithhold,
} from './action-delivery-withhold.mts'

export async function executeCopyrightActionIntent(
  intent: CopyrightClaimedActionIntent,
  now: Date,
  dependencies: CopyrightActionDeliveryDependencies,
): Promise<'applied' | 'stale' | 'blocked' | 'not_claimed'> {
  let restorePublishedTuple: { placementId: string; revision: number; imageId: string } | null =
    null
  try {
    const prepared = await prepareCopyrightAction(intent, now, dependencies)
    if (typeof prepared === 'string') return prepared
    const { legal, placement, deliveryKey } = prepared
    const tuple = {
      placementId: placement.placementId,
      revision: placement.revision,
      imageId: placement.imageId,
    }
    if (legal.action === 'restore') restorePublishedTuple = tuple
    if (deliveryKey) await dependencies.publishStagedMediaDeliveryRecord(deliveryKey)
    else await dependencies.publishImagePlacementDeliveryRecord({ ...tuple, state: 'withheld' })
    const finalized = await finalizeCopyrightActionAfterDelivery(
      intent.id,
      legal.action,
      now,
      dependencies,
    )
    if (legal.action === 'restore' && !finalized) {
      await dependencies.publishImagePlacementDeliveryRecord({ ...tuple, state: 'withheld' })
      return 'stale'
    }
    return finalized ? 'applied' : 'stale'
  } catch (error) {
    return await compensateCopyrightActionFailure(
      intent,
      now,
      restorePublishedTuple,
      dependencies,
      error,
    )
  }
}

async function prepareCopyrightAction(
  intent: CopyrightClaimedActionIntent,
  now: Date,
  dependencies: CopyrightActionDeliveryDependencies,
): Promise<
  | 'applied'
  | 'stale'
  | 'blocked'
  | 'not_claimed'
  | {
      legal: NonNullable<Awaited<ReturnType<typeof lockCopyrightActionDelivery>>>
      placement: NonNullable<
        Awaited<ReturnType<CopyrightActionDeliveryDependencies['getImagePlacementForCopyright']>>
      >
      deliveryKey: string | null
    }
> {
  await using transaction = await beginTransaction()
  const placementKey = await getCopyrightActionPlacementKey(intent.id, transaction)
  if (placementKey) await lockCopyrightActionPlacement(placementKey, transaction)
  const legal = await lockCopyrightActionDelivery(intent.id, transaction)
  if (!legal) return await commitOutcome(transaction, 'not_claimed')
  if (legal.action === 'withhold' && legal.restriction_lifted_at !== null) {
    await completeCopyrightActionIntentInTransaction({
      intentId: intent.id,
      outcome: 'stale',
      completedAt: now,
      failureMessage: 'The copyright restriction was lifted before its withhold delivery began.',
      query: transaction,
    })
    return await commitOutcome(transaction, 'stale')
  }
  const current = await dependencies.getImagePlacementForCopyright(legal.placement_key, {
    query: transaction,
  })
  if (legal.action === 'restore' && current?.deleted) {
    await completeUnavailableRestore({
      intentId: intent.id,
      legal,
      now,
      query: transaction,
      dependencies,
    })
    await transaction.commit()
    return 'applied'
  }
  if (!isCurrentPlacementForIntent(current, legal)) {
    await completeCopyrightActionIntentInTransaction({
      intentId: intent.id,
      outcome: 'stale',
      completedAt: now,
      failureMessage: 'Authoritative placement no longer matches the intent revision and asset.',
      query: transaction,
    })
    return await commitOutcome(transaction, 'stale')
  }
  dependencies.assertMediaDeliveryLegalEnforcementEnabled()
  if (await hasCopyrightActionBlocker(legal, now, transaction)) {
    await publishRestoreBlockerWithhold({
      legal,
      placement: current,
      query: transaction,
      dependencies,
    })
    await completeCopyrightActionIntentInTransaction({
      intentId: intent.id,
      outcome: 'blocked',
      completedAt: now,
      failureMessage:
        'A current copyright restriction, review, deadline, or legal hold blocks this transition.',
      query: transaction,
    })
    return await commitOutcome(transaction, 'blocked')
  }
  await prepublishWithholdIfNeeded({ legal, placement: current, query: transaction, dependencies })
  if (legal.action === 'restore') {
    const retained = await completeRestoreRetainingPlacement({
      intentId: intent.id,
      legal,
      now,
      query: transaction,
    })
    if (retained) return await commitOutcome(transaction, 'applied')
  }
  const mutation = await mutateCopyrightPlacement({
    intentId: intent.id,
    legal,
    current,
    now,
    dependencies,
    query: transaction,
  })
  if ('terminal' in mutation) return await commitOutcome(transaction, mutation.terminal)
  if (legal.action === 'restore') {
    await authorizeRestoreBeforeDelivery({ legal, intentId: intent.id, now, query: transaction })
  }
  const staged = await stageImagePlacementDeliveryRecord(
    {
      placementId: mutation.placement.placementId,
      revision: mutation.placement.revision,
      imageId: mutation.placement.imageId,
      state: legal.action === 'restore' ? 'allow' : 'withheld',
    },
    { query: transaction },
  )
  await transaction.commit()
  return { legal, placement: mutation.placement, deliveryKey: staged.deliveryKey }
}

async function commitOutcome(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  outcome: 'stale' | 'blocked' | 'not_claimed' | 'applied',
): Promise<typeof outcome> {
  await transaction.commit()
  return outcome
}
