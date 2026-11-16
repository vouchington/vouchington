import onError from '@modules/on-error'
import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import { compensateCopyrightActionFailure } from './action-delivery-compensation.mts'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'
import { finalizeCopyrightActionAfterDelivery } from './action-delivery-finalization.mts'
import { reconcilePreemptedCopyrightRestore } from './action-delivery-reconcile-preemption.mts'
import type { CopyrightClaimedActionIntent } from './action-delivery-state.mts'
import { prepareCopyrightAction } from './action-delivery-preparation.mts'

export async function executeCopyrightActionIntent(
  intent: CopyrightClaimedActionIntent,
  now: Date,
  dependencies: CopyrightActionDeliveryDependencies,
): Promise<'applied' | 'stale' | 'blocked' | 'not_claimed'> {
  let restorePublishedTuple: { placementId: string; revision: number; imageId: string } | null =
    null
  let restoreRecordId: string | null = null
  let repair = false
  let failed = false
  try {
    const prepared = await prepareCopyrightAction(intent, now)
    if (typeof prepared === 'string') return prepared
    const { legal, placement, mediaDeliveryRegistryRecordId } = prepared
    const tuple = {
      placementId: placement.placementId,
      revision: placement.revision,
      imageId: placement.imageId,
    }
    if (legal.action === 'restore') {
      restorePublishedTuple = tuple
      restoreRecordId = mediaDeliveryRegistryRecordId
    }
    if (mediaDeliveryRegistryRecordId)
      await dependencies.publishStagedMediaDeliveryRecord(mediaDeliveryRegistryRecordId)
    else await prepublishCopyrightImagePlacementDenial({ ...tuple })
    const finalized = await finalizeCopyrightActionAfterDelivery(
      intent.id,
      intent.lease_token,
      legal.action,
      now,
      tuple,
    )
    if (finalized === true) return 'applied'
    if (finalized === 'not_claimed') {
      repair = true
      return 'not_claimed'
    }
    // Finalization already denied and evicted a live restored placement. A lost lease or a
    // deleted placement still gets the edge denial; the lease owner or deletion owns eviction.
    if (legal.action === 'restore' && finalized !== 'denied')
      await prepublishCopyrightImagePlacementDenial({ ...tuple })
    return 'stale'
  } catch (err) {
    repair = true
    failed = true
    return await compensateCopyrightActionFailure(intent, now, restorePublishedTuple, err)
  } finally {
    if (repair && restoreRecordId) {
      const repairing = reconcilePreemptedCopyrightRestore(intent.id, restoreRecordId)
      if (failed)
        await repairing.catch((err: unknown) =>
          onError(err instanceof Error ? err : new Error(String(err))),
        )
      else await repairing
    }
  }
}
