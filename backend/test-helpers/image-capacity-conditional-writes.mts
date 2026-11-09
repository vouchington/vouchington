import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { releaseImagePlacementReservations } from '../services/media-delivery-safety/placement-capacity-reservations.mts'
import { writeImageDeliveryPolicyMutation } from '../services/media-delivery-safety/image-policy-mutation.mts'
import { createTestPostgresLockWaiter } from './postgres-lock-waiter.mts'

/** A real competing slot update commits after the conditional delete has selected its old tuple. */
export async function conflictTestImageCapacityRelease(placementIds: readonly string[]) {
  await using holder = await beginTransaction()
  await holder(sql`/* conflictTestImageCapacityRelease:move */
    UPDATE image_placement_capacity_reservations SET slot_number = 3
    WHERE placement_id = ${placementIds[0]}`)
  await using waiter = await createTestPostgresLockWaiter({
    holder,
    lock: { kind: 'transaction' },
    selected: {
      marker: '/* releaseImagePlacementReservations */',
      binding: { index: 0, value: placementIds },
    },
  })
  const pending = releaseImagePlacementReservations(waiter.query, placementIds).then(
    () => null,
    (err: unknown) => err,
  )
  await waiter.waitForLock(pending)
  await holder.commit()
  return await pending
}

/** Advance the actual placement revision while policy publication is still using its old tuple. */
export async function conflictTestImagePolicyWrite(imageId: string, placementId: string) {
  await using holder = await beginTransaction()
  await holder(sql`/* conflictTestImagePolicyWrite:placement */
    UPDATE media_placements SET copyright_withheld_at = CURRENT_TIMESTAMP, revision = revision + 1
    WHERE id = ${placementId}`)
  await using waiter = await createTestPostgresLockWaiter({
    holder,
    lock: { kind: 'transaction' },
    selected: {
      marker: '/* writeImagePolicy:placements */',
      binding: { index: 1, value: [placementId] },
    },
  })
  const pending = writeImageDeliveryPolicyMutation(waiter.query, imageId, scope =>
    scope(sql`/* conflictTestImagePolicyWrite:image */
      UPDATE images SET is_flagged_by_openai_omni_moderation = true WHERE id = ${imageId}`),
  ).then(
    () => null,
    (err: unknown) => err,
  )
  await waiter.waitForLock(pending)
  await holder.commit()
  return await pending
}

export async function readTestImageCapacityPolicy(imageId: string, placementId: string) {
  const { rows } = await read<{
    image_policy: boolean
    reservation_policy: boolean
    placement_policy: boolean
  }>(sql`/* readTestImageCapacityPolicy */
    SELECT image.is_delivery_eligible AS image_policy,
      reservation.is_current_image_delivery_eligible AS reservation_policy,
      placement.is_current_image_delivery_eligible AS placement_policy
    FROM images image
    JOIN image_placement_capacity_reservations reservation ON reservation.image_id = image.id
    JOIN media_placements placement ON placement.id = reservation.placement_id
    WHERE image.id = ${imageId} AND placement.id = ${placementId}`)
  return rows[0]
}
