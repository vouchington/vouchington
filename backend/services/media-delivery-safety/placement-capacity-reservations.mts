import { withTransactionSavepoint } from '@data-stores/psql/transaction-savepoint'
import { claimImagePlacementReservations } from './placement-capacity-claim.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import { IMAGE_PLACEMENT_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { createCodedError } from '@vouchington/sentry'
import sql from 'sql-template-strings'
import { getMediaDeliverySafetyWorkLimit } from './work-limits.mts'

import {
  ImagePlacementCapacityConflictError,
  type ImagePlacementCapacityReservation,
} from './placement-capacity-types.mts'
export type { ImagePlacementCapacityReservation } from './placement-capacity-types.mts'

/**
 * Claim the entire concrete change after owner writes and before provider side effects.
 * A short claim releases every slot from this attempt before taking a fresh snapshot.
 */
export async function reserveImagePlacementChanges(
  query: TransactionQuery,
  releasePlacementIds: readonly string[],
  reservations: readonly ImagePlacementCapacityReservation[],
): Promise<void> {
  const attempts = getMediaDeliverySafetyWorkLimit('placement_reservation_attempts')
  const cap = getMediaDeliverySafetyWorkLimit('max_placements_per_image')
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // oxlint-disable no-await-in-loop -- Short unique claims roll back the complete bounded phase before another attempt.
    // no-mistakes-disable-next-line query-reached-per-item: configured bounded retry rolls back every concrete slot change before rereading free slots; no provider effect occurs here.
    if (await attemptImagePlacementCapacity(query, releasePlacementIds, reservations, cap)) return
    // oxlint-enable no-await-in-loop
  }
  throw createCodedError(409, 'Image placement limit reached', IMAGE_PLACEMENT_LIMIT_REACHED)
}

async function attemptImagePlacementCapacity(
  query: TransactionQuery,
  releasePlacementIds: readonly string[],
  reservations: readonly ImagePlacementCapacityReservation[],
  cap: number,
): Promise<boolean> {
  const incomplete = new Error('Incomplete image capacity claim')
  try {
    return await withTransactionSavepoint(query, async scope => {
      // This discovery takes no locks: every target below is an actual reservation delete/insert.

      const { rows: outgoing } = await scope<{
        placement_id: string
        image_id: string
      }>(sql`/* reserveImagePlacementChanges:outgoing */
        SELECT placement_id, image_id FROM image_placement_capacity_reservations
        WHERE placement_id = ANY(${[...releasePlacementIds]}::uuid[]) ORDER BY image_id, slot_number`)
      const imageIds = [
        ...new Set([
          ...outgoing.map(row => row.image_id),
          ...reservations.map(row => row.imageId.toLowerCase()),
        ]),
      ].toSorted()
      let complete = true
      for (const imageId of imageIds) {
        // oxlint-disable no-await-in-loop -- Actual image mutations retain canonical image order.
        // no-mistakes-disable-next-line query-reached-per-item: sorted actual outgoing/incoming image writes must settle each image before taking a higher image target.
        if (!(await settleImageCapacity(scope, imageId, outgoing, reservations, cap))) {
          // oxlint-enable no-await-in-loop
          complete = false
          break
        }
      }
      if (!complete) throw incomplete
      await scope(sql`/* reserveImagePlacementChanges:projectPolicy */
          UPDATE media_placements placement SET is_current_image_delivery_eligible = reservation.is_current_image_delivery_eligible
          FROM image_placement_capacity_reservations reservation
          WHERE reservation.placement_id = placement.id
            AND reservation.placement_id = ANY(${reservations.map(row => row.placementId)}::uuid[])
            AND placement.is_current_image_delivery_eligible IS DISTINCT FROM reservation.is_current_image_delivery_eligible`)
      return true
    })
  } catch (err) {
    if (err === incomplete || err instanceof ImagePlacementCapacityConflictError) return false
    throw err
  }
}

async function settleImageCapacity(
  query: TransactionQuery,
  imageId: string,
  outgoing: readonly { placement_id: string; image_id: string }[],
  reservations: readonly ImagePlacementCapacityReservation[],
  cap: number,
) {
  await releaseImagePlacementReservations(
    query,
    outgoing.flatMap(row => (row.image_id === imageId ? [row.placement_id] : [])),
  )
  return claimImagePlacementReservations(
    query,
    reservations.filter(row => row.imageId.toLowerCase() === imageId),
    cap,
  )
}

/** Delete only the concrete activation and policy snapshot selected by this statement. */
export async function releaseImagePlacementReservations(
  query: TransactionQuery,
  placementIds: readonly string[],
): Promise<void> {
  if (placementIds.length === 0) return
  const { rows } = await query<{ expected_count: number; deleted_count: number }>(sql`
    /* releaseImagePlacementReservations */
    WITH expected AS MATERIALIZED (
      SELECT placement_id, image_id, activation_revision, slot_number, is_current_image_delivery_eligible
      FROM image_placement_capacity_reservations
      WHERE placement_id = ANY(${[...placementIds]}::uuid[])
      ORDER BY image_id, slot_number
    ), removed AS (
      DELETE FROM image_placement_capacity_reservations reservation
      USING expected
      WHERE reservation.placement_id = ANY(${[...placementIds]}::uuid[])
        AND reservation.placement_id = expected.placement_id
        AND reservation.image_id = expected.image_id
        AND reservation.activation_revision = expected.activation_revision
        AND reservation.slot_number = expected.slot_number
        AND reservation.is_current_image_delivery_eligible = expected.is_current_image_delivery_eligible
      RETURNING reservation.placement_id
    ) SELECT (SELECT count(*)::int FROM expected) AS expected_count,
      (SELECT count(*)::int FROM removed) AS deleted_count`)
  if (rows[0]!.expected_count !== rows[0]!.deleted_count)
    throw new ImagePlacementCapacityConflictError()
}
