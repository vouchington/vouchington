import type { TransactionQuery } from '@data-stores/psql/types'
import { isMediaDeliveryEdgeEnforcementEnabled } from '@modules/aws/media-delivery-registry'
import {
  lockImageDeliveryMutation,
  prepublishImagePlacementDenials,
} from '@services/media-delivery-safety'

/** The post service owns admission, while images owns the exact image placement delivery saga. */
export async function preparePostImageDeliveryMutation(
  query: TransactionQuery,
  input: { postId?: string; imageIds: string[]; retainImageIds?: string[] },
): Promise<void> {
  if (!isMediaDeliveryEdgeEnforcementEnabled()) return
  await lockImageDeliveryMutation(query, {
    postIds: input.postId ? [input.postId] : [],
    imageIds: input.imageIds,
  })
  if (input.postId) {
    await prepublishImagePlacementDenials(
      { postId: input.postId, retainImageIds: input.retainImageIds },
      { query },
    )
  }
}
