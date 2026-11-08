import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { mediaDeliverySafetyWorkMaxValues } from '@services/media-delivery-safety/work-limits'
import { assertImagePlacementCapacity } from '@services/media-delivery-safety/placement-capacity'
import { syncPostImagePlacements } from '@services/posts/image-placements'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture } from '../run-support.mts'

const cap = mediaDeliverySafetyWorkMaxValues.max_placements_per_image
const retainedHistory = 1_900
const existingLive = 100
const imageId = seedUuid(0, 'fd')
const surfaceImageId = seedUuid(1, 'fd')
const mixedImageId = seedUuid(2, 'fd')

async function seedBindings(
  image: string,
  count: number,
  tag: string,
  family: 'post' | 'surface',
  postStart: number,
): Promise<void> {
  const placements = Array.from({ length: count }, (_, index) => seedUuid(index, tag))
  await write(
    `/* seedExplainCapacity:bindings */
    INSERT INTO retained_image_placement_bindings (placement_id, image_id, binding_family)
    SELECT id, $2::uuid, $3::image_binding_families FROM unnest($1::uuid[]) id
    ON CONFLICT (placement_id) DO NOTHING`,
    [placements, image, family],
  )
  await write(
    `/* seedExplainCapacity:placements */
    INSERT INTO media_placements (id) SELECT id FROM unnest($1::uuid[]) id
    ON CONFLICT (id) DO NOTHING`,
    [placements],
  )
  if (family === 'post') {
    const posts = Array.from({ length: count }, (_, index) => seedUuid(postStart + index, '05'))
    await write(
      `/* seedExplainCapacity:posts */
      INSERT INTO image_placements (placement_id, post_id, image_id)
      SELECT placement_id, post_id, $3::uuid FROM unnest($1::uuid[], $2::uuid[]) seed(placement_id, post_id)
      ON CONFLICT (placement_id) DO NOTHING`,
      [placements, posts, image],
    )
  } else {
    const owners = Array.from({ length: count }, (_, index) =>
      seedUuid(index + (tag === 'e3' ? 0 : cap), 'e6'),
    )
    await write(
      `/* seedExplainCapacity:owners */
      INSERT INTO users (id, username)
      SELECT id, 'explain-cap-' || replace(id::text, '-', '') FROM unnest($1::uuid[]) id
      ON CONFLICT (id) DO NOTHING`,
      [owners],
    )
    await write(
      `/* seedExplainCapacity:surfaces */
      INSERT INTO image_surface_placements (placement_id, surface_kind, image_id, user_id)
      SELECT placement_id, 'user-profile-image', $3::uuid, owner_id
      FROM unnest($1::uuid[], $2::uuid[]) seed(placement_id, owner_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM image_surface_placements existing
        WHERE existing.placement_id = seed.placement_id
      )
      ON CONFLICT (placement_id) DO NOTHING`,
      [placements, owners, image],
    )
  }
}

export async function runImagePlacementCapacityScenarios(): Promise<void> {
  const mixedPosts = Math.floor(cap / 2)
  await seedBindings(imageId, cap - existingLive, 'e2', 'post', 52_000)
  await seedBindings(surfaceImageId, cap, 'e3', 'surface', 0)
  await seedBindings(mixedImageId, mixedPosts, 'e4', 'post', 60_000)
  await seedBindings(mixedImageId, cap - mixedPosts, 'e5', 'surface', 0)
  await write(
    '/* analyzeExplainCapacity */ ANALYZE image_placements, image_surface_placements, media_placements',
  )
  // The popular-image fixture has retained history. Its measured row budget describes this
  // corpus only; LIMIT on live rows does not bound reads of arbitrary retired history.
  const historyBudget = cap + retainedHistory
  await capture(
    'image-placement-capacity-at-cap',
    imageId,
    true,
    historyBudget,
    'idx_image_placements__image',
  )
  await capture('image-placement-capacity-empty', seedUuid(999_999, 'fd'), false, 1)
  await capture(
    'image-placement-capacity-surface',
    surfaceImageId,
    true,
    cap,
    'idx_image_surface_placements__image',
  )
  await capture('image-placement-capacity-mixed', mixedImageId, true, cap)

  await captureActivation('image-placement-activation-existing', 51_999, false)
  await captureActivation('image-placement-activation-new', 80_000, true)
  await captureActivation('image-placement-activation-retired', 50_000, true)
}

async function captureActivation(id: string, postIndex: number, refused: boolean): Promise<void> {
  registerScenarioContract(id, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'usesIndexes', indexes: ['image_placements_post_id_image_id_key'] },
      { kind: 'maxProcessedRows', relation: 'image_placements', max: 1 },
      { kind: 'maxProcessedRows', relation: 'media_placements', max: 1 },
    ],
  })
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    async () => {
      const run = () => syncPostImagePlacements(seedUuid(postIndex, '05'), [imageId], query)
      if (refused) await assert.rejects(run, { code: 'IMAGE_PLACEMENT_LIMIT_REACHED' })
      else await run()
    },
    undefined,
    'syncPostImagePlacements:activating',
  )
}

async function capture(
  id: string,
  image: string,
  full: boolean,
  budget: number,
  index?: string,
): Promise<void> {
  registerScenarioContract(id, {
    expectations: [
      ...(index ? [{ kind: 'usesIndexes' as const, indexes: [index] }] : []),
      { kind: 'maxProcessedRows', relation: 'image_placements', max: budget },
      { kind: 'maxProcessedRows', relation: 'image_surface_placements', max: budget },
      { kind: 'maxProcessedRows', relation: 'media_placements', max: budget },
    ],
    seededRows: {
      image_placements: 7_001 + cap - existingLive + Math.floor(cap / 2),
      media_placements: 19_000 + 3 * cap - existingLive,
    },
  })
  await using query = await beginTransaction()
  await runAndCapture(
    id,
    async () => {
      if (full)
        await assert.rejects(() => assertImagePlacementCapacity([image], query), {
          code: 'IMAGE_PLACEMENT_LIMIT_REACHED',
        })
      else await assertImagePlacementCapacity([image], query)
    },
    undefined,
    'assertImagePlacementCapacity',
  )
  await query.commit()
}
