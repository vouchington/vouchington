import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import { compensateCopyrightActionFailure } from './action-delivery-compensation.mts'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'
import { finalizeCopyrightActionAfterDelivery } from './action-delivery-finalization.mts'
import type { CopyrightClaimedActionIntent } from './action-delivery-state.mts'
import { prepareCopyrightAction } from './action-delivery-preparation.mts'

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
      tuple,
    )
    if (finalized === true) return 'applied'
    // Finalization already denied and evicted a live restored placement. A lost lease or a
    // deleted placement still gets the edge denial; the lease owner or deletion owns eviction.
    if (legal.action === 'restore' && finalized !== 'denied')
      await prepublishCopyrightImagePlacementDenial({ ...tuple })
    return 'stale'
  } catch (err) {
    return compensateCopyrightActionFailure(intent, now, restorePublishedTuple, err)
  }
}
