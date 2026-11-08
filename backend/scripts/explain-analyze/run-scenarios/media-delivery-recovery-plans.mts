import assert from 'node:assert/strict'
import { extractQueryName, getCapturedQueries, write } from '@data-stores/psql'
import { repairFailedImageDeliveryMutation } from '@services/media-delivery-safety/delivery-registry-recovery'
import {
  getMediaDeliverySafetyWorkLimit,
  mediaDeliverySafetyWorkConfig,
} from '@services/media-delivery-safety/work-limits'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  NOISE_PER_FAMILY,
  TARGET_COUNT,
  noiseImage,
  ownedTargetRecords,
  resetTargetMarkers,
  targetImage,
  targetPost,
} from './media-delivery-lock-fixture.mts'

export async function captureRecovery(): Promise<void> {
  await mediaDeliverySafetyWorkConfig.waitForInitialization()
  const limit = getMediaDeliverySafetyWorkLimit('recovery_page_size')
  assert.ok(limit < TARGET_COUNT, 'The recovery fixture must contain a marker beyond the page')
  const previous = process.env
  const env = {
    MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED: 'true',
    MEDIA_DELIVERY_REGISTRY_TABLE: 'explain-only',
    MEDIA_DELIVERY_REGISTRY_REGION: 'us-east-1',
    MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID: 'explain-only',
  }
  process.env = { ...previous, ...env }
  try {
    const cases = [
      {
        id: 'media-delivery-recovery-post',
        input: { postIds: [targetPost] },
        postBound: TARGET_COUNT,
        surfaceBound: 0,
        distinctBound: TARGET_COUNT,
        expectedRecords: ownedTargetRecords().slice(1),
      },
      {
        id: 'media-delivery-recovery-image',
        input: { imageIds: [targetImage(0), noiseImage(NOISE_PER_FAMILY)] },
        postBound: 1,
        surfaceBound: 1,
        distinctBound: 2,
        expectedRecords: ownedTargetRecords().slice(0, 2),
      },
      {
        id: 'media-delivery-recovery-mixed',
        input: { postIds: [targetPost], imageIds: [targetImage(0), noiseImage(NOISE_PER_FAMILY)] },
        postBound: TARGET_COUNT + 1,
        surfaceBound: 1,
        distinctBound: TARGET_COUNT + 1,
        expectedRecords: ownedTargetRecords(),
      },
      {
        id: 'media-delivery-recovery-empty',
        input: { imageIds: [seedUuid(999_999, 'fd')] },
        postBound: 0,
        surfaceBound: 0,
        distinctBound: 0,
        expectedRecords: [],
      },
    ] as const
    for (const scenario of cases) {
      // no-mistakes-disable-next-line query-reached-per-item: each fixed scope begins with no selected markers, so the actual service cannot publish externally.
      await resetTargetMarkers(false)
      registerScenarioContract(scenario.id, {
        allowEmptyResult: scenario.id === 'media-delivery-recovery-empty',
        expectations: [
          ...(scenario.id === 'media-delivery-recovery-post' ||
          scenario.id === 'media-delivery-recovery-mixed'
            ? [{ kind: 'usesIndexes' as const, indexes: ['image_placements_post_id_image_id_key'] }]
            : []),
          ...(scenario.id === 'media-delivery-recovery-image' ||
          scenario.id === 'media-delivery-recovery-mixed'
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
          {
            kind: 'maxProcessedRows',
            relation: 'media_delivery_registry_records',
            max: scenario.distinctBound,
          },
          {
            kind: 'maxProcessedRows',
            relation: 'media_delivery_repair_markers',
            max: scenario.distinctBound,
          },
          { kind: 'maxBitmapIndexRows', max: (scenario.postBound + scenario.surfaceBound) * 3 },
        ],
        seededRows: {
          image_placements: NOISE_PER_FAMILY + TARGET_COUNT,
          image_surface_placements: NOISE_PER_FAMILY,
          media_delivery_registry_records: 2 * NOISE_PER_FAMILY + TARGET_COUNT,
          media_delivery_repair_markers: 2 * NOISE_PER_FAMILY + TARGET_COUNT,
        },
      })
      // no-mistakes-disable-next-line query-reached-per-item: four fixed scopes have independent captured plans.
      await runAndCapture(
        scenario.id,
        () =>
          repairFailedImageDeliveryMutation({
            postIds: 'postIds' in scenario.input ? [...scenario.input.postIds] : undefined,
            imageIds: 'imageIds' in scenario.input ? [...scenario.input.imageIds] : undefined,
          }),
        undefined,
        'repairFailedImageDeliveryMutation',
        {
          afterCapture: async () => {
            await resetTargetMarkers(true)
            const captured = getCapturedQueries().find(
              query => extractQueryName(query.text) === 'repairFailedImageDeliveryMutation',
            )
            assert.ok(captured, 'The real recovery selector must be captured')
            const { rows } = await write<{ media_delivery_registry_record_id: string }>(
              `/* captureRecovery:assertSelector */ ${captured.text}`,
              [...captured.values],
            )
            assert.deepEqual(
              rows.map(row => row.media_delivery_registry_record_id),
              scenario.expectedRecords.toSorted((a, b) => a.localeCompare(b)).slice(0, limit),
              'Recovery must select the exact scoped marker page, in registry-id order',
            )
          },
        },
      )
    }
    const { rows } = await write<{ count: number }>(
      '/* assertDeliveryLockMarkerSentinel */ SELECT count(*)::integer AS count FROM media_delivery_repair_markers WHERE media_delivery_registry_record_id = ANY($1::uuid[])',
      [ownedTargetRecords()],
    )
    assert.equal(
      rows[0]?.count,
      TARGET_COUNT + 1,
      'EXPLAIN replay must preserve all owned markers including the sentinel',
    )
  } finally {
    process.env = previous
    await resetTargetMarkers(false)
  }
}
