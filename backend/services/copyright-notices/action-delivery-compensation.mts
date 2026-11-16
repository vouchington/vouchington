import { beginTransaction } from '@data-stores/psql'
import { invalidateCopyrightLegalRemovalSurfaces } from './action-delivery-cache.mts'
import {
  repairFailedImageDeliveryMutation,
  lockImageDeliveryMutation,
} from '@services/media-delivery-safety'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'
import {
  failCopyrightActionIntent,
  renewCopyrightActionIntentLease,
  type CopyrightClaimedActionIntent,
} from './action-delivery-state.mts'

export async function compensateCopyrightActionFailure(
  intent: CopyrightClaimedActionIntent,
  now: Date,
  restorePublishedTuple: { placementId: string; revision: number; imageId: string } | null,
  error: unknown,
): Promise<'blocked'> {
  const failureMessage = error instanceof Error ? error.message : String(error)
  const result = await failCopyrightActionIntent({
    intentId: intent.id,
    leaseToken: intent.lease_token,
    failedAt: now,
    failureMessage,
    beforeRelease: async () => {
      if (intent.action === 'withhold')
        await repairFailedImageDeliveryMutation({ imageIds: [intent.image_id] })
      if (restorePublishedTuple) {
        await using denial = await beginTransaction()
        if (!(await renewCopyrightActionIntentLease(intent.id, intent.lease_token, denial))) return
        await lockImageDeliveryMutation(denial, {
          placementIds: [restorePublishedTuple.placementId],
          placementOnly: true,
        })
        await prepublishCopyrightImagePlacementDenial(
          {
            ...restorePublishedTuple,
          },
          { query: denial, placementLocked: true },
        )
        await denial.commit()
        // The denial committed in its own transaction, so eviction sees it. A failed eviction
        // leaves the intent claimed until lease recovery retries it.
        await invalidateCopyrightLegalRemovalSurfaces({
          placement_id: restorePublishedTuple.placementId,
          action: 'withhold',
        })
      }
    },
  })
  if (result === 'not_claimed') throw error
  if (result === 'retrying') throw error
  if (result === 'failed') {
    const conflict = error as { status?: number; cause?: { code?: string } } | null
    if (conflict?.status === 409 && conflict.cause?.code === '40001') throw error
    return 'blocked'
  }
  throw error
}
