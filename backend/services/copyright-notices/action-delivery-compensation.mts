import { compensateFailedImageDeliveryMutation } from '@services/images/delivery-registry'
import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import {
  failCopyrightActionIntent,
  type CopyrightClaimedActionIntent,
} from './action-delivery-state.mts'

export async function compensateCopyrightActionFailure(
  intent: CopyrightClaimedActionIntent,
  now: Date,
  restorePublishedTuple: { placementId: string; revision: number; imageId: string } | null,
  dependencies: CopyrightActionDeliveryDependencies,
  error: unknown,
): Promise<'blocked'> {
  if (intent.action === 'withhold')
    await compensateFailedImageDeliveryMutation({ imageIds: [intent.image_id] })
  if (restorePublishedTuple) {
    await dependencies.publishImagePlacementDeliveryRecord({
      ...restorePublishedTuple,
      state: 'withheld',
    })
  }
  const failureMessage = error instanceof Error ? error.message : String(error)
  const result = await failCopyrightActionIntent({
    intentId: intent.id,
    failedAt: now,
    failureMessage,
  })
  if (result === 'retrying') throw error
  if (result === 'failed') return 'blocked'
  throw error
}
