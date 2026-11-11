import { beginTransaction } from '@data-stores/psql'
import { lockImageDeliveryMutation } from '@services/media-delivery-safety/delivery-lock'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  NOISE_PER_FAMILY,
  TARGET_COUNT,
  noiseImage,
  noisePost,
  postPlacement,
  seedMediaDeliveryLockFixture,
  surfacePlacement,
  targetImage,
  targetPlacement,
  targetPost,
} from './media-delivery-lock-fixture.mts'
import { captureRecovery } from './media-delivery-recovery-plans.mts'

export async function runMediaDeliveryLockPlans(): Promise<void> {
  await seedMediaDeliveryLockFixture()
  const cases = [
    {
      id: 'media-delivery-lock-post',
      input: { postIds: [targetPost] },
      postBound: TARGET_COUNT,
      surfaceBound: 0,
      placementBound: TARGET_COUNT,
    },
    {
      id: 'media-delivery-lock-image',
      input: { imageIds: [noiseImage(0), noiseImage(NOISE_PER_FAMILY)] },
      postBound: 1,
      surfaceBound: 1,
      placementBound: 2,
    },
    {
      id: 'media-delivery-lock-placement',
      input: { placementIds: [surfacePlacement(0)], placementOnly: true },
      postBound: 0,
      surfaceBound: 1,
      placementBound: 1,
    },
    {
      id: 'media-delivery-lock-mixed',
      input: {
        postIds: [targetPost, noisePost(0)],
        imageIds: [targetImage(0)],
        placementIds: [targetPlacement(0), postPlacement(0), surfacePlacement(0)],
      },
      postBound: TARGET_COUNT + 4,
      surfaceBound: 1,
      placementBound: TARGET_COUNT + 2,
    },
    {
      id: 'media-delivery-lock-empty',
      input: { placementIds: [seedUuid(999_999, 'e7')] },
      postBound: 0,
      surfaceBound: 0,
      placementBound: 0,
    },
  ] as const
  for (const scenario of cases) {
    for (const [suffix, annotation] of [
      ['find', 'lockImageDeliveryMutation:findBindings'],
      ['placements', 'lockImageDeliveryMutation:lockPlacements'],
    ] as const) {
      const id = `${scenario.id}-${suffix}`
      registerScenarioContract(id, {
        allowEmptyResult: scenario.id === 'media-delivery-lock-empty',
        expectations: [
          ...(scenario.id === 'media-delivery-lock-post' ||
          scenario.id === 'media-delivery-lock-mixed'
            ? [{ kind: 'usesIndexes' as const, indexes: ['image_placements_post_id_image_id_key'] }]
            : []),
          ...(scenario.id === 'media-delivery-lock-image' ||
          scenario.id === 'media-delivery-lock-mixed'
            ? [
                {
                  kind: 'usesIndexes' as const,
                  indexes: ['idx_image_placements__image', 'idx_image_surface_placements__image'],
                },
              ]
            : []),
          { kind: 'maxProcessedRows', relation: 'image_placements', max: scenario.postBound },
          {
            kind: 'maxProcessedRows',
            relation: 'image_surface_placements',
            max: scenario.surfaceBound,
          },
          { kind: 'maxProcessedRows', relation: 'media_placements', max: scenario.placementBound },
          // Bitmap work includes binding probe hits and distinct parent primary-key hits.
          {
            kind: 'maxBitmapIndexRows',
            max: scenario.postBound + scenario.surfaceBound + scenario.placementBound,
          },
        ],
        seededRows: {
          image_placements: NOISE_PER_FAMILY + TARGET_COUNT,
          image_surface_placements: NOISE_PER_FAMILY,
          media_placements: 2 * NOISE_PER_FAMILY + TARGET_COUNT,
        },
      })
      // no-mistakes-disable-next-line query-reached-per-item: ten fixed selector/query cases capture independent plans.
      await runAndCapture(
        id,
        async () => {
          await using query = await beginTransaction()
          await lockImageDeliveryMutation(query, {
            postIds: 'postIds' in scenario.input ? [...scenario.input.postIds] : undefined,
            imageIds: 'imageIds' in scenario.input ? [...scenario.input.imageIds] : undefined,
            placementIds:
              'placementIds' in scenario.input ? [...scenario.input.placementIds] : undefined,
            placementOnly:
              'placementOnly' in scenario.input ? scenario.input.placementOnly : undefined,
          })
        },
        undefined,
        annotation,
      )
    }
  }
  await captureRecovery()
}
