import { beginTransaction } from '@data-stores/psql'
import { mediaDeliverySafetyWorkMaxValues } from '@services/media-delivery-safety/work-limits'
import { seedUuid } from './common.mts'
const cap = mediaDeliverySafetyWorkMaxValues.max_placements_per_image
// A few thousand analyzed rows make a placement primary-key lookup lose to a sequential scan.
// Production tables are much larger, and this corpus makes the primary key the cheaper plan.
export const IMAGE_PLACEMENT_CAPACITY_CORPUS = 80_000

/** Each cohort owns at most the hard cap plus one retired candidate. */
export async function seedImagePlacementCapacityCohort(
  index: number,
  active: number,
  family: 'post' | 'surface' | 'mixed',
  withCandidate = true,
) {
  const imageId = seedUuid(900_000 + index, 'b7')
  const actorId = seedUuid(900_000 + index, 'b8')
  const ids = Array.from({ length: active + (withCandidate ? 1 : 0) }, (_, ordinal) =>
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
    (id, created_by_id, post_type, title, markdown, created_via, gemini_embedding_2_content_sha256, llm_moderation_content_sha256)
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
  await query.commit()
  const row = (ordinal: number) => ({
    placementId: ids[ordinal]!,
    imageId,
    bindingFamily: families[ordinal] === 'post' ? ('post' as const) : ('surface' as const),
  })
  return {
    imageId,
    placementIds: ids.slice(0, active),
    current: row(0),
    candidate: row(withCandidate ? active : 0),
  }
}
