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

/** Recover the whole SQL mutation before retry; provider settlement is never retried. */
export async function withImagePlacementMutation<Plan, Result>(
  query: TransactionQuery,
  mutate: (scope: TransactionQuery) => Promise<Plan>,
  settle: (plan: Plan, scope: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const attempts = getMediaDeliverySafetyWorkLimit('placement_reservation_attempts')
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let mutationComplete = false
    try {
      // oxlint-disable no-await-in-loop -- Each bounded attempt restores the entire SQL mutation before retry and before provider effects.
      return await withTransactionSavepoint(query, async scope => {
        const plan = await mutate(scope)
        mutationComplete = true
        return settle(plan, scope)
      })
      // oxlint-enable no-await-in-loop
    } catch (err) {
      if (mutationComplete) throw err
      // Earlier caller-owned locks survive this savepoint; retrying a deadlock can recreate it.
      if (err instanceof Error && 'code' in err && err.code === '40P01')
        throw createCodedError(
          409,
          'Concurrent image placement change',
          IMAGE_PLACEMENT_LIMIT_REACHED,
        )
      if (!(err instanceof ImagePlacementCapacityConflictError)) throw err
      if (attempt === attempts) throw capacityLimitError()
    }
  }
  throw new Error('Image placement mutation did not complete')
}

/** Standalone callers retain recovery; owner mutations call the attempt inside their own scope. */
export async function reserveImagePlacementChanges(
  query: TransactionQuery,
  releasePlacementIds: readonly string[],
  reservations: readonly ImagePlacementCapacityReservation[],
): Promise<void> {
  if (releasePlacementIds.length === 0 && reservations.length === 0) return
  await withImagePlacementMutation(
    query,
    scope => reserveImagePlacementChangesAttempt(scope, releasePlacementIds, reservations),
    async () => undefined,
  )
}

/** Mutate actual slot ownership once; the enclosing owner scope handles retry and rollback. */
export async function reserveImagePlacementChangesAttempt(
  query: TransactionQuery,
  releasePlacementIds: readonly string[],
  reservations: readonly ImagePlacementCapacityReservation[],
): Promise<void> {
  if (releasePlacementIds.length === 0 && reservations.length === 0) return
  await releaseImagePlacementReservations(query, releasePlacementIds)
  const result = await claimImagePlacementReservations(
    query,
    reservations,
    getMediaDeliverySafetyWorkLimit('max_placements_per_image'),
  )
  if (result === 'capacity_exceeded') throw capacityLimitError()
  if (result === 'conflict') throw new ImagePlacementCapacityConflictError()
  if (reservations.length === 0) return
  await query(sql`/* reserveImagePlacementChanges:projectPolicy */
    UPDATE media_placements placement SET is_current_image_delivery_eligible = reservation.is_current_image_delivery_eligible
    FROM image_placement_capacity_reservations reservation
    WHERE reservation.placement_id = placement.id
      AND reservation.placement_id = ANY(${reservations.map(row => row.placementId)}::uuid[])
      AND placement.is_current_image_delivery_eligible IS DISTINCT FROM reservation.is_current_image_delivery_eligible`)
}

function capacityLimitError() {
  return createCodedError(409, 'Image placement limit reached', IMAGE_PLACEMENT_LIMIT_REACHED)
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
