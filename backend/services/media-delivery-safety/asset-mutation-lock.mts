import type { QueryExecutor } from '@data-stores/psql/types'
import { lockImageAssetAdmission } from './asset-admission-lock.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'

/** Unsafe writers retain the asset root before their first binding discovery. */
export async function lockImageAssetMutation(
  query: QueryExecutor,
  input: { imageIds: string[]; postIds?: string[] },
): Promise<void> {
  await lockImageAssetAdmission(input.imageIds, query)
  await lockImageDeliveryMutation(query, input)
}
