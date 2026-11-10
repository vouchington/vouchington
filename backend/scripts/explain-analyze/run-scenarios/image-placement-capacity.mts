import assert from 'node:assert/strict'
import { runImageCapacityConditionalWrites } from './image-capacity-conditional-writes.mts'
import { beginTransaction, write } from '@data-stores/psql'
import {
  mediaDeliverySafetyWorkConfig,
  mediaDeliverySafetyWorkMaxValues,
} from '@services/media-delivery-safety/work-limits'
import {
  reserveImagePlacementChanges,
  type ImagePlacementCapacityReservation,
} from '@services/media-delivery-safety/placement-capacity-reservations'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedImagePlacementCapacityCohort } from '../seed-data/image-placement-capacity.mts'
import { runAndCapture } from '../run-support.mts'

const cap = mediaDeliverySafetyWorkMaxValues.max_placements_per_image
const relation = 'image_placement_capacity_reservations'
const queries = ['claimImagePlacementReservations']
export async function runImagePlacementCapacityScenarios(): Promise<void> {
  await mediaDeliverySafetyWorkConfig.waitForInitialization()
  const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
    max_placements_per_image: cap,
  })
  try {
    const full = await seedImagePlacementCapacityCohort(0, cap, 'post')
    const empty = await seedImagePlacementCapacityCohort(1, 0, 'post')
    const surface = await seedImagePlacementCapacityCohort(2, cap, 'surface')
    const mixed = await seedImagePlacementCapacityCohort(3, cap, 'mixed')
    const sparse = await seedImagePlacementCapacityCohort(4, 1, 'post')
    const retired = await seedImagePlacementCapacityCohort(5, 0, 'surface')
    await write(
      `/* seedCapacitySparseSlot */ UPDATE image_placement_capacity_reservations SET slot_number = $2 WHERE placement_id = $1`,
      [sparse.current.placementId, cap],
    )
    // Plain ANALYZE leaves relallvisible at 0 after these inserts. The occupied-slot lookup
    // then sorts a sequential scan of every reservation and reads past the per-image cap.
    await write('/* analyzeCapacity */ VACUUM (ANALYZE) image_placement_capacity_reservations')
    await write('/* analyzeCapacityImages */ ANALYZE images')
    await capture('image-placement-capacity-at-cap', full.candidate, true)
    await capture('image-placement-capacity-empty', empty.candidate, false)
    await capture('image-placement-capacity-surface', surface.candidate, true)
    await capture('image-placement-capacity-mixed', mixed.candidate, true)
    await captureFullBatch([full.candidate, mixed.candidate])
    const restoreLower = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
      max_placements_per_image: 1,
    })
    try {
      await capture('image-placement-activation-existing', full.current, false, true)
    } finally {
      restoreLower()
    }
    await capture('image-placement-activation-new', sparse.candidate, false)
    await capture('image-placement-activation-retired', retired.candidate, false)
    await runImageCapacityConditionalWrites(full.imageId, full.placementIds)
  } finally {
    restore()
  }
}

async function capture(
  id: string,
  reservation: ImagePlacementCapacityReservation,
  refused: boolean,
  existing = false,
) {
  registerScenarioContract(id, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation, max: cap + 1 },
      { kind: 'maxProcessedRows', relation: 'images', max: 1 },
    ],
    forbidSequentialScans: [relation],
    seededRows: { [relation]: 3 * cap + 1 },
  })
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    async () => {
      if (!existing && reservation.bindingFamily === 'surface')
        await query(
          `/* activateCapacitySurfaceOwner */
          UPDATE users owner SET profile_image_id = binding.image_id
          FROM image_surface_placements binding
          WHERE binding.placement_id = $1::uuid AND owner.id = binding.user_id
            AND owner.profile_image_id IS NULL`,
          [reservation.placementId],
        )
      else if (!existing)
        await query(
          `/* activateCapacityCandidate */ UPDATE media_placements SET retired_at = NULL, retirement_reason = NULL, revision = revision + 1 WHERE id = $1`,
          [reservation.placementId],
        )
      const claim = () => reserveImagePlacementChanges(query, [], [reservation])
      if (refused) await assert.rejects(claim, { code: 'IMAGE_PLACEMENT_LIMIT_REACHED' })
      else await claim()
    },
    undefined,
    queries,
    {
      // Roll back actual capture writes before both plan modes and repeated INSERT EXPLAINs.
      afterCapture: () => query.rollback(),
    },
  )
}

/** A two-image request must perform one claim, bounded independently by each image cap. */
async function captureFullBatch(reservations: readonly ImagePlacementCapacityReservation[]) {
  const id = 'image-placement-capacity-batch-at-cap'
  registerScenarioContract(id, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation, max: reservations.length * (cap + 1) },
      { kind: 'maxProcessedRows', relation: 'images', max: reservations.length },
    ],
    forbidSequentialScans: [relation],
    seededRows: { [relation]: 3 * cap + 1 },
  })
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    async () => {
      await query(
        `/* activateCapacityBatchCandidates */
      UPDATE media_placements SET retired_at = NULL, retirement_reason = NULL, revision = revision + 1
      WHERE id = ANY($1::uuid[])`,
        [reservations.map(row => row.placementId)],
      )
      await assert.rejects(() => reserveImagePlacementChanges(query, [], reservations), {
        code: 'IMAGE_PLACEMENT_LIMIT_REACHED',
      })
    },
    undefined,
    queries,
    { afterCapture: () => query.rollback() },
  )
}
