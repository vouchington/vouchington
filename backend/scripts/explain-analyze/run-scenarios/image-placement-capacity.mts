import assert from 'node:assert/strict'
import { runImageCapacityConditionalWrites } from './image-capacity-conditional-writes.mts'
import { beginTransaction, write } from '@data-stores/psql'
import {
  mediaDeliverySafetyWorkConfig,
  mediaDeliverySafetyWorkMaxValues,
} from '@services/media-delivery-safety/work-limits'
import { admitImagePlacements } from '@services/media-delivery-safety/placement-capacity-reservations'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  IMAGE_PLACEMENT_CAPACITY_CORPUS,
  seedImagePlacementCapacityCohort,
} from '../seed-data/image-placement-capacity.mts'
import { runAndCapture } from '../run-support.mts'

const cap = mediaDeliverySafetyWorkMaxValues.max_placements_per_image
const bindings = 'retained_image_placement_bindings'
const placements = 'media_placements'
const queries = ['countImagePlacementOccupancy']

type CapacityRow = {
  placementId: string
  imageId: string
  bindingFamily: 'post' | 'surface'
}

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
      '/* analyzeCapacity */ VACUUM (ANALYZE) retained_image_placement_bindings, media_placements',
    )
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
    await runImageCapacityConditionalWrites()
  } finally {
    restore()
  }
}

async function capture(id: string, row: CapacityRow, refused: boolean, existing = false) {
  registerScenarioContract(id, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: bindings, max: cap + 1 },
      { kind: 'maxProcessedRows', relation: placements, max: cap + 1 },
    ],
    forbidSequentialScans: [bindings, placements],
    seededRows: {
      [bindings]: IMAGE_PLACEMENT_CAPACITY_CORPUS,
      [placements]: IMAGE_PLACEMENT_CAPACITY_CORPUS,
    },
  })
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    async () => {
      if (!existing && row.bindingFamily === 'surface')
        await query(
          `/* activateCapacitySurfaceOwner */
          UPDATE users owner SET profile_image_id = binding.image_id
          FROM image_surface_placements binding
          WHERE binding.placement_id = $1::uuid AND owner.id = binding.user_id
            AND owner.profile_image_id IS NULL`,
          [row.placementId],
        )
      else if (!existing)
        await query(
          `/* activateCapacityCandidate */ UPDATE media_placements SET retired_at = NULL, retirement_reason = NULL, revision = revision + 1 WHERE id = $1`,
          [row.placementId],
        )
      const admit = () =>
        admitImagePlacements(query, [
          { imageId: row.imageId, placementId: row.placementId, alreadyActive: existing },
        ])
      if (refused) await assert.rejects(admit, { code: 'IMAGE_PLACEMENT_LIMIT_REACHED' })
      else await admit()
    },
    undefined,
    queries,
    {
      afterCapture: () => query.rollback(),
    },
  )
}

/** One count for every image in the batch, bounded independently by each image cap. */
async function captureFullBatch(rows: readonly CapacityRow[]) {
  const id = 'image-placement-capacity-batch-at-cap'
  registerScenarioContract(id, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: bindings, max: rows.length * (cap + 1) },
      { kind: 'maxProcessedRows', relation: placements, max: rows.length * (cap + 1) },
    ],
    forbidSequentialScans: [bindings, placements],
    seededRows: {
      [bindings]: IMAGE_PLACEMENT_CAPACITY_CORPUS,
      [placements]: IMAGE_PLACEMENT_CAPACITY_CORPUS,
    },
  })
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    async () => {
      await query(
        `/* activateCapacityBatchCandidates */
      UPDATE media_placements SET retired_at = NULL, retirement_reason = NULL, revision = revision + 1
      WHERE id = ANY($1::uuid[])`,
        [rows.map(row => row.placementId)],
      )
      await assert.rejects(
        () =>
          admitImagePlacements(
            query,
            rows.map(row => ({ imageId: row.imageId, placementId: row.placementId })),
          ),
        { code: 'IMAGE_PLACEMENT_LIMIT_REACHED' },
      )
    },
    undefined,
    queries,
    { afterCapture: () => query.rollback() },
  )
}
