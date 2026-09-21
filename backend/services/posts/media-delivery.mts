import type { TransactionQuery } from '@data-stores/psql/types'
import { isMediaDeliveryEdgeEnforcementEnabled } from '@modules/aws/media-delivery-registry'
import {
  lockImageDeliveryMutation,
  prepublishImagePlacementDenials,
  publishLegacyImageDeliveryRecord,
} from '@services/media-delivery-safety'

/** The post service owns admission, while images owns one delivery saga for every route kind. */
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
  for (const imageId of [...new Set(input.imageIds)].toSorted()) {
    // oxlint-disable-next-line no-await-in-loop -- every attached image must lose its generic alias before commit.
    await publishLegacyImageDeliveryRecord(imageId, 'withheld', { query })
  }
}
