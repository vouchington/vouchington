import { beginTransaction } from '@data-stores/psql'
import { deliveryTupleKey, imageDeliveryAuthorizations } from './delivery-authority.mts'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { stageImagePlacementDeliveryRecords } from './delivery-registry-staging.mts'

export type DeliveryTuple = { placement_id: string; placement_revision: number; image_id: string }

/** Re-proves authority under the placement fences, then stages the whole page in one transaction. */
export async function stageCurrentDeliveryRecords(
  records: readonly DeliveryTuple[],
): Promise<void> {
  if (records.length === 0) return
  await using transaction = await beginTransaction()
  // ast-grep-ignore: no-three-sequential-awaits -- Placement fences must be held before the authority read, which must precede staging, so the steps are dependent.
  await lockImageDeliveryMutation(transaction, {
    placementIds: records.map(record => record.placement_id),
    placementOnly: true,
  })
  const allowed = await imageDeliveryAuthorizations(transaction, records)
  await stageImagePlacementDeliveryRecords(
    records.map(record => ({
      placementId: record.placement_id,
      revision: record.placement_revision,
      imageId: record.image_id,
      state: allowed.get(deliveryTupleKey(record)) ? 'allow' : 'withheld',
    })),
    { query: transaction },
  )
  await transaction.commit()
}
