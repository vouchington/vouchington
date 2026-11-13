import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { beginTransaction } from '@data-stores/psql'
import { assertMediaDeliveryLegalEnforcementEnabled } from '@modules/aws'
import {
  getImagePlacementForCopyright,
  type CopyrightImagePlacement,
} from '@services/images/placements'
import { stageImagePlacementDeliveryRecord } from '@services/media-delivery-safety'
import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import { compensateCopyrightActionFailure } from './action-delivery-compensation.mts'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'
import { finalizeCopyrightActionAfterDelivery } from './action-delivery-finalization.mts'
import {
  completeCopyrightActionIntentInTransaction,
  hasCopyrightActionBlocker,
  lockCopyrightActionDelivery,
  type CopyrightClaimedActionIntent,
} from './action-delivery-state.mts'
import {
  authorizeRestoreBeforeDelivery,
  retainRestoreWhenOtherRestrictionsActive,
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
    const prepared = await prepareCopyrightAction(intent, now)
    if (typeof prepared === 'string') return prepared
    const { legal, placement, mediaDeliveryRegistryRecordId } = prepared
    const tuple = {
      placementId: placement.placementId,
      revision: placement.revision,
      imageId: placement.imageId,
    }
    if (legal.action === 'restore') restorePublishedTuple = tuple
    if (mediaDeliveryRegistryRecordId)
      await dependencies.publishStagedMediaDeliveryRecord(mediaDeliveryRegistryRecordId)
    else await prepublishCopyrightImagePlacementDenial({ ...tuple })
    const finalized = await finalizeCopyrightActionAfterDelivery(
      intent.id,
      intent.lease_token,
      legal.action,
      now,
    )
    if (legal.action === 'restore' && !finalized) {
      await prepublishCopyrightImagePlacementDenial({ ...tuple })
      return 'stale'
    }
    return finalized ? 'applied' : 'stale'
  } catch (err) {
    if ((err as { code?: string } | null)?.code === '40001') {
      if (restorePublishedTuple)
        await prepublishCopyrightImagePlacementDenial(restorePublishedTuple)
      throw err
    }
    return compensateCopyrightActionFailure(intent, now, restorePublishedTuple, err)
  }
}

async function prepareCopyrightAction(
  intent: CopyrightClaimedActionIntent,
  now: Date,
  retainChecked = false,
): Promise<
  | 'applied'
  | 'stale'
  | 'blocked'
  | 'not_claimed'
  | {
      legal: NonNullable<Awaited<ReturnType<typeof lockCopyrightActionDelivery>>>
      placement: CopyrightImagePlacement
      mediaDeliveryRegistryRecordId: string | null
    }
> {
  await using transaction = await beginTransaction({ serializable: true })
  const legal = await lockCopyrightActionDelivery(intent.id, intent.lease_token, transaction)
  if (!legal) return await commitOutcome(transaction, 'not_claimed')
  await readCopyrightThreadRetirement(transaction, [legal.copyright_notice_id])
  if (legal.action === 'withhold' && legal.restriction_lifted_at !== null) {
    await completeCopyrightActionIntentInTransaction({
      intentId: intent.id,
      leaseToken: intent.lease_token,
      outcome: 'stale',
      completedAt: now,
      failureMessage: 'The copyright restriction was lifted before its withhold delivery began.',
      query: transaction,
    })
    return await commitOutcome(transaction, 'stale')
  }
  const current = await getImagePlacementForCopyright(legal.placement_id, {
    query: transaction,
  })
  if (legal.action === 'restore' && current?.deleted) {
    await completeUnavailableRestore({
      intentId: intent.id,
      legal,
      now,
      query: transaction,
    })
    await transaction.commit()
    return 'applied'
  }
  if (!isCurrentPlacementForIntent(current, legal)) {
    await completeCopyrightActionIntentInTransaction({
      intentId: intent.id,
      leaseToken: intent.lease_token,
      outcome: 'stale',
      completedAt: now,
      failureMessage: 'Authoritative placement no longer matches the intent revision and asset.',
      query: transaction,
    })
    return await commitOutcome(transaction, 'stale')
  }
  assertMediaDeliveryLegalEnforcementEnabled()
  if (await hasCopyrightActionBlocker(legal, now, transaction)) {
    await publishRestoreBlockerWithhold({
      legal,
      placement: current,
      query: transaction,
    })
    await completeCopyrightActionIntentInTransaction({
      intentId: intent.id,
      leaseToken: intent.lease_token,
      outcome: 'blocked',
      completedAt: now,
      failureMessage:
        'A current copyright restriction, review, deadline, or legal hold blocks this transition.',
      query: transaction,
    })
    return await commitOutcome(transaction, 'blocked')
  }
  await prepublishWithholdIfNeeded({ legal, placement: current, query: transaction })
  if (legal.action === 'restore' && !retainChecked) {
    // The intent lock is released first: the short SERIALIZABLE retention transaction
    // completes the work item by lease, then the rest of the preparation runs again.
    await transaction.commit()
    if (await retainRestoreWhenOtherRestrictionsActive({ intentId: intent.id, legal, now }))
      return 'applied'
    return await prepareCopyrightAction(intent, now, true)
  }
  const mutation = await mutateCopyrightPlacement({
    intentId: intent.id,
    legal,
    current,
    now,
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
  return {
    legal,
    placement: mutation.placement,
    mediaDeliveryRegistryRecordId: staged.mediaDeliveryRegistryRecordId,
  }
}

async function commitOutcome(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  outcome: 'stale' | 'blocked' | 'not_claimed' | 'applied',
): Promise<typeof outcome> {
  await transaction.commit()
  return outcome
}
