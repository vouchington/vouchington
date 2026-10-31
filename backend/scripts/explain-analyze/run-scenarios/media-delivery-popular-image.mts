import { write } from '@data-stores/psql'
import { stageImagePlacementDeliveryRecordPage } from '@services/media-delivery-safety/delivery-registry-staging-page'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const POPULAR_COUNT = 2_000

export async function runMediaDeliveryPopularImageScenario(): Promise<void> {
  let first: Awaited<ReturnType<typeof stageImagePlacementDeliveryRecordPage>> | undefined
  const imageId = seedUuid(0, 'fd')
  const startAfter = { placement_id: seedUuid(0, 'e0'), placement_revision: 0, image_id: imageId }
  const placementIds = Array.from({ length: POPULAR_COUNT }, (_, index) => seedUuid(index, 'e1'))
  const postIds = Array.from({ length: POPULAR_COUNT }, (_, index) =>
    seedUuid(50_000 + index, '05'),
  )
  await write(
    `/* seedExplainPopularImage:bindings */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    SELECT id, $2::uuid, 'post' FROM unnest($1::uuid[]) id
    ON CONFLICT (placement_id) DO NOTHING`,
    [placementIds, imageId],
  )
  await write(
    `/* seedExplainPopularImage:placements */
    INSERT INTO media_placements (id, retired_at, retirement_reason)
    SELECT id, CASE WHEN ordinal <= 1900 THEN NOW() - INTERVAL '1 day' ELSE NULL END,
      CASE WHEN ordinal <= 1900 THEN 'owner_removed'::media_placement_retirement_reasons ELSE NULL END
    FROM unnest($1::uuid[]) WITH ORDINALITY AS seed(id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [placementIds],
  )
  await write(
    `/* seedExplainPopularImage:sourceBindings */
    INSERT INTO image_placements (placement_id, post_id, image_id)
    SELECT placement_id, post_id, $3::uuid
    FROM unnest($1::uuid[], $2::uuid[]) seed(placement_id, post_id)
    ON CONFLICT (placement_id) DO NOTHING`,
    [placementIds, postIds, imageId],
  )
  await write(`/* seedExplainPopularImage:analyze */
    ANALYZE image_placements, image_surface_placements, media_placements,
      media_delivery_registry_records, retained_image_placement_bindings`)
  registerScenarioContract('media-delivery-staging-popular-image', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['media_placements_pkey'] },
      { kind: 'maxProcessedRows', relation: 'image_placements', max: 1_100 },
      { kind: 'maxProcessedRows', relation: 'media_placements', max: 1_100 },
      { kind: 'maxProcessedRows', relation: 'media_delivery_registry_records', max: 350 },
    ],
    seededRows: {
      image_placements: 7_001,
      media_placements: 19_000,
      media_delivery_registry_records: 19_000,
    },
  })
  await runAndCapture(
    'media-delivery-staging-popular-image',
    async () => {
      first = await stageImagePlacementDeliveryRecordPage({
        scanBefore: '2035-01-01T00:00:00.000Z',
        after: startAfter,
      })
    },
    undefined,
    'stageImagePlacementDeliveryRecordPage',
  )
  if (!first?.hasMore || !first.after || first.staged !== 0)
    throw new Error(
      'Popular-image first raw page must advance past retired placements without staging',
    )
  const after = first.after
  registerScenarioContract('media-delivery-staging-popular-image-continuation', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['media_placements_pkey'] },
      { kind: 'maxProcessedRows', relation: 'image_placements', max: 1_100 },
      { kind: 'maxProcessedRows', relation: 'media_placements', max: 1_100 },
      { kind: 'maxProcessedRows', relation: 'media_delivery_registry_records', max: 350 },
    ],
    seededRows: {
      image_placements: 7_001,
      media_placements: 19_000,
      media_delivery_registry_records: 19_000,
    },
  })
  let second: Awaited<ReturnType<typeof stageImagePlacementDeliveryRecordPage>> | undefined
  await runAndCapture(
    'media-delivery-staging-popular-image-continuation',
    async () => {
      second = await stageImagePlacementDeliveryRecordPage({
        scanBefore: '2035-01-01T00:00:00.000Z',
        after,
      })
    },
    undefined,
    'stageImagePlacementDeliveryRecordPage',
  )
  if (!second || second.staged !== 100)
    throw new Error('Popular-image continuation must reach and stage 100 later active placements')
}
