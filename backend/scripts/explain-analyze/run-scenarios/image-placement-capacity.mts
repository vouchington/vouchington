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
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture } from '../run-support.mts'

const cap = mediaDeliverySafetyWorkMaxValues.max_placements_per_image
const relation = 'image_placement_capacity_reservations'
const queries = [
  'claimImagePlacementReservations:existing',
  'claimImagePlacementReservations:occupied',
  'claimImagePlacementReservations:insert',
]
/** Each cohort owns at most the hard cap plus one retired candidate. */
async function seedCohort(index: number, active: number, family: 'post' | 'surface' | 'mixed') {
  const imageId = seedUuid(900_000 + index, 'b7')
  const actorId = seedUuid(900_000 + index, 'b8')
  const ids = Array.from({ length: active + 1 }, (_, ordinal) =>
    seedUuid(900_000 + index * (cap + 1) + ordinal, 'b9'),
  )
  const owners = ids.map((_, ordinal) => seedUuid(900_000 + index * (cap + 1) + ordinal, 'ba'))
  const families = ids.map((_, ordinal) =>
    family === 'surface' || (family === 'mixed' && ordinal % 2 === 1) ? 'surface' : 'post',
  )
  await using query = await beginTransaction()
  await query(
    `/* seedCapacityActor */ INSERT INTO users (id, username)
    VALUES ($1::uuid, 'explain-capacity-' || replace(($1::uuid)::text, '-', '')) ON CONFLICT (id) DO NOTHING`,
    [actorId],
  )
  await query(
    `/* seedCapacityImage */ INSERT INTO images (id, created_by_id, data, sha_256, s3_key)
    VALUES ($1::uuid, $2::uuid, '{}'::jsonb, decode(md5(($1::uuid)::text) || md5(($1::uuid)::text), 'hex'), md5(($1::uuid)::text) || md5(($1::uuid)::text)) ON CONFLICT (id) DO NOTHING`,
    [imageId, actorId],
  )
  await query(
    `/* seedCapacityOwners */ INSERT INTO users (id, username)
    SELECT id, 'explain-capacity-owner-' || replace(id::text, '-', '') FROM unnest($1::uuid[]) id ON CONFLICT (id) DO NOTHING`,
    [owners],
  )
  await query(
    `/* seedCapacityPosts */ INSERT INTO posts
    (id, created_by_id, post_type, title, markdown, created_via, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT id, $2::uuid, 'discussion', 'Capacity seed', 'Capacity seed', 'system', decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex')
    FROM unnest($1::uuid[]) id ON CONFLICT (id) DO NOTHING`,
    [owners, actorId],
  )
  await query(
    `/* seedCapacityBindings */ INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    SELECT id, $2::uuid, family::image_binding_families FROM unnest($1::uuid[], $3::text[]) seed(id, family)
    ON CONFLICT (placement_id) DO NOTHING`,
    [ids, imageId, families],
  )
  await query(
    `/* seedCapacityPlacements */ INSERT INTO media_placements (id, retired_at, retirement_reason)
    SELECT id, CASE WHEN ordinal > $2 THEN CURRENT_TIMESTAMP END,
      CASE WHEN ordinal > $2 THEN 'owner_removed'::media_placement_retirement_reasons END
    FROM unnest($1::uuid[]) WITH ORDINALITY seed(id, ordinal) ON CONFLICT (id) DO NOTHING`,
    [ids, active],
  )
  await query(
    `/* seedCapacityPostBindings */ INSERT INTO image_placements (placement_id, post_id, image_id)
    SELECT id, owner_id, $4::uuid FROM unnest($1::uuid[], $2::uuid[], $3::text[]) seed(id, owner_id, family)
    WHERE family = 'post' ON CONFLICT (placement_id) DO NOTHING`,
    [ids, owners, families, imageId],
  )
  await query(
    `/* seedCapacitySurfaceBindings */ INSERT INTO image_surface_placements (placement_id, surface_kind, image_id, user_id)
    SELECT id, 'user-profile-image', $4::uuid, owner_id FROM unnest($1::uuid[], $2::uuid[], $3::text[]) seed(id, owner_id, family)
    WHERE family = 'surface' AND NOT EXISTS (
      SELECT 1 FROM image_surface_placements existing WHERE existing.placement_id = seed.id
    ) ON CONFLICT (placement_id) DO NOTHING`,
    [ids, owners, families, imageId],
  )
  await query(
    `/* seedCapacitySurfaceOwnerProjection */
    UPDATE users owner SET profile_image_id = binding.image_id
    FROM image_surface_placements binding JOIN media_placements placement ON placement.id = binding.placement_id
    WHERE binding.placement_id = ANY($1::uuid[]) AND placement.retired_at IS NULL
      AND owner.id = binding.user_id AND owner.profile_image_id IS DISTINCT FROM binding.image_id`,
    [ids],
  )
  await query(
    `/* seedCapacityReservations */ INSERT INTO image_placement_capacity_reservations
    (placement_id, image_id, binding_family, activation_revision, slot_number, post_placement_id, surface_placement_id, post_id, is_current_image_delivery_eligible)
    SELECT id, $4::uuid, family::image_binding_families, 0, ordinal::integer,
      CASE WHEN family = 'post' THEN id END, CASE WHEN family = 'surface' THEN id END,
      CASE WHEN family = 'post' THEN owner_id END, false
    FROM unnest($1::uuid[], $2::uuid[], $3::text[]) WITH ORDINALITY seed(id, owner_id, family, ordinal)
    WHERE ordinal <= $5 ON CONFLICT (placement_id) DO NOTHING`,
    [ids, owners, families, imageId, active],
  )
  await query.commit()
  const reservation = (ordinal: number): ImagePlacementCapacityReservation => ({
    placementId: ids[ordinal]!,
    imageId,
    bindingFamily: families[ordinal] === 'post' ? 'post' : 'surface',
    activationRevision: ordinal < active ? 0 : 1,
    ...(families[ordinal] === 'post' ? { postId: owners[ordinal]! } : {}),
  })
  return {
    imageId,
    placementIds: ids.slice(0, active),
    current: reservation(0),
    candidate: reservation(active),
  }
}

export async function runImagePlacementCapacityScenarios(): Promise<void> {
  await mediaDeliverySafetyWorkConfig.waitForInitialization()
  const restore = overrideDynamicConfigFieldsForTest(mediaDeliverySafetyWorkConfig, {
    max_placements_per_image: cap,
  })
  try {
    const full = await seedCohort(0, cap, 'post')
    const empty = await seedCohort(1, 0, 'post')
    const surface = await seedCohort(2, cap, 'surface')
    const mixed = await seedCohort(3, cap, 'mixed')
    const sparse = await seedCohort(4, 1, 'post')
    const retired = await seedCohort(5, 0, 'surface')
    await write(
      `/* seedCapacitySparseSlot */ UPDATE image_placement_capacity_reservations SET slot_number = $2 WHERE placement_id = $1`,
      [sparse.current.placementId, cap],
    )
    await write('/* analyzeCapacity */ ANALYZE image_placement_capacity_reservations, images')
    await capture('image-placement-capacity-at-cap', full.candidate, true)
    await capture('image-placement-capacity-empty', empty.candidate, false)
    await capture('image-placement-capacity-surface', surface.candidate, true)
    await capture('image-placement-capacity-mixed', mixed.candidate, true)
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
    existing ? queries[0] : queries,
    {
      // Roll back actual capture writes before both plan modes and repeated INSERT EXPLAINs.
      afterCapture: () => query.rollback(),
    },
  )
}
