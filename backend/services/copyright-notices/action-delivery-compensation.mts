import { repairFailedImageDeliveryMutation } from '@services/media-delivery-safety'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'
import {
  failCopyrightActionIntent,
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
        await prepublishCopyrightImagePlacementDenial({
          ...restorePublishedTuple,
        })
      }
    },
  })
  if (result === 'not_claimed') throw error
  if (result === 'retrying') throw error
  if (result === 'failed') return 'blocked'
  throw error
}
