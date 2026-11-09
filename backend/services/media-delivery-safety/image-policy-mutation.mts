import { ImagePlacementCapacityConflictError } from './placement-capacity-types.mts'
import { withTransactionSavepoint } from '@data-stores/psql/transaction-savepoint'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  getMediaDeliverySafetyWorkLimit,
  mediaDeliverySafetyWorkMaxValues,
} from './work-limits.mts'
import { prepublishImagePlacementDenialBatch } from './delivery-registry-publish.mts'

type PolicyPlacement = { placement_id: string; revision: number }
type PolicySnapshot = PolicyPlacement & {
  activation_revision: number | null
  reservation_policy: boolean | null
  placement_policy: boolean
}

/** Only SQL owner changes belong in the callback. Every retry completes before provider effects. */
export async function writeImageDeliveryPolicyMutation<Result>(
  query: TransactionQuery,
  imageId: string,
  writeImage: (scope: TransactionQuery) => Promise<Result>,
): Promise<Result> {
  const attempts = getMediaDeliverySafetyWorkLimit('policy_mutation_attempts')
  let settled: { result: Result; eligible: boolean; placements: PolicyPlacement[] } | undefined
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // oxlint-disable no-await-in-loop -- One bounded SQL-only attempt rolls back completely before retry.
      settled = await attemptImageDeliveryPolicyMutation(query, imageId, writeImage)
      // oxlint-enable no-await-in-loop
      break
    } catch (err) {
      if (!isRetryablePolicyConflict(err) || attempt === attempts) throw err
    }
  }
  if (!settled) throw new Error('Image policy phase did not complete')
  if (!settled.eligible)
    await prepublishImagePlacementDenialBatch(
      settled.placements.map(row => ({
        placementId: row.placement_id,
        revision: row.revision,
        imageId,
      })),
      { query },
    )
  return settled.result
}

async function attemptImageDeliveryPolicyMutation<Result>(
  query: TransactionQuery,
  imageId: string,
  writeImage: (scope: TransactionQuery) => Promise<Result>,
) {
  return withTransactionSavepoint(query, async scope => {
    await scope(
      '/* writeImagePolicy:defer */ SET CONSTRAINTS fk_image_placement_capacity__live_image, fk_image_placement_capacity__image_policy DEFERRED',
    )

    const { rows: placements } = await scope<{
      placement_id: string
    }>(sql`/* writeImagePolicy:capture */
        SELECT reservation.placement_id
        FROM image_placement_capacity_reservations reservation
        WHERE reservation.image_id = ${imageId}
        ORDER BY reservation.slot_number LIMIT ${mediaDeliverySafetyWorkMaxValues.max_placements_per_image}`)

    const result = await writeImage(scope)

    const { rows } = await scope<{
      is_delivery_eligible: boolean
    }>(sql`/* writeImagePolicy:current */
        SELECT is_delivery_eligible FROM images WHERE id = ${imageId}`)
    const eligible = rows[0]?.is_delivery_eligible ?? false
    const ids = placements.map(row => row.placement_id)

    // The owner callback may retire placements and release their reservations itself.
    const { rows: writeSet } = await scope<PolicySnapshot>(sql`/* writeImagePolicy:writeSet */
        SELECT placement.id AS placement_id, placement.revision,
          reservation.activation_revision,
          reservation.is_current_image_delivery_eligible AS reservation_policy,
          placement.is_current_image_delivery_eligible AS placement_policy
        FROM media_placements placement
        LEFT JOIN LATERAL (
          SELECT activation_revision, is_current_image_delivery_eligible
          FROM image_placement_capacity_reservations
          WHERE placement_id = placement.id LIMIT 1
        ) reservation ON true
        WHERE placement.id = ANY(${ids}::uuid[]) ORDER BY placement.id`)
    const reservationChanges = writeSet.filter(
      row => row.reservation_policy !== null && row.reservation_policy !== eligible,
    )
    const { rows: changedReservations } = await scope(sql`/* writeImagePolicy:reservations */
        UPDATE image_placement_capacity_reservations reservation
        SET is_current_image_delivery_eligible = ${eligible}
        FROM unnest(${reservationChanges.map(row => row.placement_id)}::uuid[],
          ${reservationChanges.map(row => row.activation_revision)}::integer[],
          ${reservationChanges.map(row => row.reservation_policy)}::boolean[])
          expected(placement_id, activation_revision, prior_policy)
        WHERE reservation.placement_id = ANY(${reservationChanges.map(row => row.placement_id)}::uuid[])
          AND reservation.placement_id = expected.placement_id AND reservation.image_id = ${imageId}
          AND reservation.activation_revision = expected.activation_revision
          AND reservation.is_current_image_delivery_eligible = expected.prior_policy
        RETURNING reservation.placement_id`)
    if (changedReservations.length !== reservationChanges.length)
      throw new ImagePlacementCapacityConflictError()

    const placementChanges = writeSet.filter(row => row.placement_policy !== eligible)
    const { rows: changedPlacements } = await scope(sql`/* writeImagePolicy:placements */
        UPDATE media_placements placement SET is_current_image_delivery_eligible = ${eligible}
        FROM unnest(${placementChanges.map(row => row.placement_id)}::uuid[],
          ${placementChanges.map(row => row.revision)}::integer[],
          ${placementChanges.map(row => row.placement_policy)}::boolean[])
          expected(placement_id, revision, prior_policy)
        WHERE placement.id = ANY(${placementChanges.map(row => row.placement_id)}::uuid[])
          AND placement.id = expected.placement_id AND placement.revision = expected.revision
          AND placement.is_current_image_delivery_eligible = expected.prior_policy
        RETURNING placement.id`)
    if (changedPlacements.length !== placementChanges.length)
      throw new ImagePlacementCapacityConflictError()
    // A missed future reservation still carries the old boolean and rejects this phase here.

    await scope(
      '/* writeImagePolicy:validate */ SET CONSTRAINTS fk_image_placement_capacity__live_image, fk_image_placement_capacity__image_policy IMMEDIATE',
    )
    // The actual policy writes now own these rows; a concurrent restoration may have advanced
    // availability since candidate capture, so deny the current tuple rather than that snapshot.
    const { rows: currentPlacements } =
      await scope<PolicyPlacement>(sql`/* writeImagePolicy:denials */
        SELECT id AS placement_id, revision FROM media_placements WHERE id = ANY(${ids}::uuid[])
          AND retired_at IS NULL ORDER BY id`)

    return { result, eligible, placements: currentPlacements }
  })
}

function isRetryablePolicyConflict(err: unknown): boolean {
  if (err instanceof ImagePlacementCapacityConflictError) return true
  if (!(err instanceof Error) || !('code' in err)) return false
  return (
    err.code === '55P03' ||
    err.code === '40P01' ||
    (err.code === '23503' &&
      'constraint' in err &&
      (err.constraint === 'fk_image_placement_capacity__image_policy' ||
        err.constraint === 'fk_image_placement_capacity__live_image'))
  )
}
