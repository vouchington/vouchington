import type { QueryExecutor } from '@data-stores/psql/types'
import { lockImageAssetAdmission } from './asset-admission-lock.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'

/** Unsafe writers retain the asset root before their first binding discovery. */
export async function lockImageAssetMutation(
  query: QueryExecutor,
  input: { imageIds: string[]; postIds?: string[]; imageOnly?: true },
): Promise<void> {
  await lockImageAssetAdmission(input.imageIds, query)
  // An image-wide delivery fence retires placements without taking the unbounded post domains.
  // Asset admission still closes the attachment race before binding discovery.
  await lockImageDeliveryMutation(query, { ...input, placementOnly: input.imageOnly })
}
