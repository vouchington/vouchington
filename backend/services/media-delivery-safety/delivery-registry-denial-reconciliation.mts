import { beginTransaction } from '@data-stores/psql'
import { isMediaDeliveryRegistryPublicationEnabled } from '@modules/aws/media-delivery-registry'
import sql from 'sql-template-strings'
import { lockImageDeliveryMutation } from './delivery-lock.mts'
import { imageDeliveryAuthorityProof } from './delivery-authority.mts'
import { recordImageDeliveryRepairMarker } from './delivery-repair-markers.mts'
import { claimMediaDeliveryProjection } from './delivery-registry-claims.mts'
import { publishPersistedDeliveryRecord } from './delivery-registry-acknowledgement.mts'

/** Reconcile one known tuple to denial under current authority, without publishing an allow. */
export async function reconcileUnauthorizedMediaDeliveryRecord(recordId: string): Promise<void> {
  if (!isMediaDeliveryRegistryPublicationEnabled()) return
  await using query = await beginTransaction()
  const { rows } = await query<{
    placement_id: string
    placement_revision: number
    image_id: string
  }>(sql`/* reconcileUnauthorizedMediaDeliveryRecord:tuple */
    SELECT placement_id, placement_revision, image_id
    FROM media_delivery_registry_records WHERE id = ${recordId}
  `)
  const record = rows[0]
  if (!record) return
  // Retain the existing denial placement protocol through publication. No notice read lock:
  // the actual registry write proves current authority, and later allows get a newer generation.
  await lockImageDeliveryMutation(query, {
    placementIds: [record.placement_id],
    placementOnly: true,
  })
  const statement = sql`/* reconcileUnauthorizedMediaDeliveryRecord:deny */
    UPDATE media_delivery_registry_records authority
    SET desired_state = 'withheld', generation = authority.generation + 1
    WHERE authority.id = ${recordId} AND NOT (`
  statement.append(imageDeliveryAuthorityProof()).append(sql`) RETURNING id`)
  const { rowCount } = await query(statement)
  if (!rowCount) return
  await recordImageDeliveryRepairMarker({
    placementId: record.placement_id,
    revision: record.placement_revision,
    imageId: record.image_id,
  })
  const claim = await claimMediaDeliveryProjection(query, recordId)
  if (!claim) throw new Error(`Media delivery projection is already owned ${recordId}`)
  await publishPersistedDeliveryRecord(claim, query)
  await query.commit()
}
