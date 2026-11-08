import { write } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'

export const NOISE_PER_FAMILY = 2_000
export const TARGET_COUNT = 101
export const targetPost = seedUuid(700_000, 'e5')
export const postPlacement = (i: number) => seedUuid(500_000 + i, 'e7')
export const surfacePlacement = (i: number) => seedUuid(500_000 + i, 'e8')
export const targetPlacement = (i: number) => seedUuid(500_000 + i, 'e9')
export const targetImage = (i: number) => seedUuid(700_000 + i, 'e4')
export const noiseImage = (i: number) => seedUuid(600_000 + i, 'e4')
export const noisePost = (i: number) => seedUuid(600_000 + i, 'e5')

export async function seedMediaDeliveryLockFixture(): Promise<void> {
  const postIds = Array.from({ length: NOISE_PER_FAMILY }, (_, i) => postPlacement(i))
  const surfaceIds = Array.from({ length: NOISE_PER_FAMILY }, (_, i) => surfacePlacement(i))
  const targetIds = Array.from({ length: TARGET_COUNT }, (_, i) => targetPlacement(i))
  const placementIds = [...postIds, ...surfaceIds, ...targetIds]
  const imageIds = [
    ...postIds.map((_, i) => noiseImage(i)),
    ...surfaceIds.map((_, i) => noiseImage(NOISE_PER_FAMILY + i)),
    ...targetIds.map((_, i) => targetImage(i)),
  ]
  const families = placementIds.map((_, i) =>
    i >= NOISE_PER_FAMILY && i < 2 * NOISE_PER_FAMILY ? 'surface' : 'post',
  )
  const actor = seedUuid(499_999, 'e6')
  await write(
    `/* seedDeliveryLock:actor */
    INSERT INTO users (id, username) VALUES ($1, 'explain-delivery-lock-actor')
    ON CONFLICT (id) DO NOTHING`,
    [actor],
  )
  await write(
    `/* seedDeliveryLock:posts */
    INSERT INTO posts (id, created_by_id, post_type, title, markdown, created_via,
      bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
    SELECT id, $2::uuid, 'discussion', 'Delivery lock seed', 'Delivery lock seed', 'system',
      decode(repeat('00',32),'hex'), decode(repeat('00',32),'hex')
    FROM unnest($1::uuid[]) seed(id) ON CONFLICT (id) DO NOTHING`,
    [[...postIds.map((_, i) => noisePost(i)), targetPost], actor],
  )
  await write(
    `/* seedDeliveryLock:images */
    INSERT INTO retained_image_identities (id, created_by_id)
    SELECT id, $2::uuid FROM unnest($1::uuid[]) seed(id)
    ON CONFLICT (id) DO NOTHING`,
    [imageIds, actor],
  )
  await write(
    `/* seedDeliveryLock:bindings */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    SELECT id, image_id, family::image_binding_families
    FROM unnest($1::uuid[], $2::uuid[], $3::text[]) seed(id,image_id,family)
    ON CONFLICT (placement_id) DO NOTHING`,
    [placementIds, imageIds, families],
  )
  await write(
    `/* seedDeliveryLock:placements */
    INSERT INTO media_placements (id) SELECT id FROM unnest($1::uuid[]) id
    ON CONFLICT (id) DO NOTHING`,
    [placementIds],
  )
  await write(
    `/* seedDeliveryLock:postBindings */
    INSERT INTO image_placements (placement_id, post_id, image_id)
    SELECT id, post_id, image_id FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) seed(id,post_id,image_id)
    ON CONFLICT (placement_id) DO NOTHING`,
    [
      [...postIds, ...targetIds],
      [...postIds.map((_, i) => noisePost(i)), ...targetIds.map(() => targetPost)],
      [...postIds.map((_, i) => noiseImage(i)), ...targetIds.map((_, i) => targetImage(i))],
    ],
  )
  const owners = surfaceIds.map((_, i) => seedUuid(500_000 + i, 'e6'))
  await write(
    `/* seedDeliveryLock:owners */
    INSERT INTO users (id, username)
    SELECT id, 'explain-delivery-lock-' || replace(id::text,'-','') FROM unnest($1::uuid[]) id
    ON CONFLICT (id) DO NOTHING`,
    [owners],
  )
  await write(
    `/* seedDeliveryLock:surfaceBindings */
    INSERT INTO image_surface_placements (placement_id,surface_kind,image_id,user_id)
    SELECT id,'user-profile-image',image_id,owner_id
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) seed(id,image_id,owner_id)
    WHERE NOT EXISTS (SELECT 1 FROM image_surface_placements existing WHERE existing.placement_id = seed.id)
    ON CONFLICT (placement_id) DO NOTHING`,
    [surfaceIds, surfaceIds.map((_, i) => noiseImage(NOISE_PER_FAMILY + i)), owners],
  )
  const recordIds = placementIds.map((_, i) => seedUuid(500_000 + TARGET_COUNT + i, 'ea'))
  await write(
    `/* seedDeliveryLock:registry */
    INSERT INTO media_delivery_registry_records (id,placement_id,placement_revision,image_id,desired_state)
    SELECT record_id,placement_id,0,image_id,'withheld'
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) seed(record_id,placement_id,image_id)
    ON CONFLICT (id) DO NOTHING`,
    [recordIds, placementIds, imageIds],
  )
  await write(
    `/* seedDeliveryLock:noiseMarkers */
    INSERT INTO media_delivery_repair_markers (media_delivery_registry_record_id,marker_token)
    SELECT id, nextval('media_delivery_registry_generation_sequence') FROM unnest($1::uuid[]) id
    ON CONFLICT (media_delivery_registry_record_id) DO NOTHING`,
    [recordIds.slice(0, 2 * NOISE_PER_FAMILY).filter((_, i) => i !== NOISE_PER_FAMILY)],
  )
  await write(
    '/* seedDeliveryLock:analyze */ ANALYZE image_placements, image_surface_placements, media_placements, media_delivery_registry_records, media_delivery_repair_markers',
  )
}

export async function resetTargetMarkers(populate: boolean): Promise<void> {
  const records = ownedTargetRecords()
  await write(
    `/* resetDeliveryLockMarkers */ DELETE FROM media_delivery_repair_markers WHERE media_delivery_registry_record_id = ANY($1::uuid[])`,
    [records],
  )
  if (!populate) return
  await write(
    `/* seedDeliveryLock:targetMarkers */
    INSERT INTO media_delivery_repair_markers (media_delivery_registry_record_id,marker_token)
    SELECT id, nextval('media_delivery_registry_generation_sequence') FROM unnest($1::uuid[]) id
    ON CONFLICT (media_delivery_registry_record_id) DO NOTHING`,
    [records],
  )
  await write('/* analyzeDeliveryLockMarkers */ ANALYZE media_delivery_repair_markers')
}

export function ownedTargetRecords(): string[] {
  return [
    seedUuid(500_000 + TARGET_COUNT + NOISE_PER_FAMILY, 'ea'),
    ...Array.from({ length: TARGET_COUNT }, (_, i) =>
      seedUuid(500_000 + TARGET_COUNT + 2 * NOISE_PER_FAMILY + i, 'ea'),
    ),
  ]
}
