import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { extractQueryName, getCapturedQueries } from '@data-stores/psql/explain-analyze'
import { listFailedImageDeliveryRepairMarkers } from '@services/media-delivery-safety/delivery-registry-recovery'
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
    await resetTargetMarkers(true)
    const pageRecords = ownedTargetRecords()
      .toSorted((a, b) => a.localeCompare(b))
      .slice(0, limit)
    const seededRows = {
      image_placements: NOISE_PER_FAMILY + TARGET_COUNT,
      image_surface_placements: NOISE_PER_FAMILY,
      media_delivery_registry_records: 2 * NOISE_PER_FAMILY + TARGET_COUNT,
      media_delivery_repair_markers: 2 * NOISE_PER_FAMILY + TARGET_COUNT,
    }
    registerScenarioContract('media-delivery-recovery-markers', {
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_media_delivery_repair_markers__oldest'],
          queryContains: 'repairFailedImageDeliveryMutation:markers',
          noSort: true,
        },
        { kind: 'maxProcessedRows', relation: 'media_delivery_repair_markers', max: limit },
        { kind: 'maxBitmapIndexRows', max: 0 },
      ],
      seededRows,
    })
    await runAndCapture(
      'media-delivery-recovery-markers',
      () => listFailedImageDeliveryRepairMarkers({ imageIds: [seedUuid(999_999, 'fd')] }),
      undefined,
      'repairFailedImageDeliveryMutation:markers',
    )
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
      registerScenarioContract(scenario.id, {
        allowEmptyResult: scenario.id === 'media-delivery-recovery-empty',
        expectations: [
          ...(scenario.id === 'media-delivery-recovery-image' ||
          scenario.id === 'media-delivery-recovery-empty'
            ? [
                {
                  kind: 'usesIndexes' as const,
                  indexes: ['idx_media_delivery_registry_records__image'],
                  queryContains: '/* repairFailedImageDeliveryMutation */',
                },
              ]
            : [
                {
                  kind: 'usesIndexes' as const,
                  indexes: ['media_delivery_registry_records_pkey', 'image_placements_pkey'],
                  queryContains: '/* repairFailedImageDeliveryMutation */',
                },
              ]),
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
        seededRows,
      })
      // no-mistakes-disable-next-line query-reached-per-item: four fixed scopes have independent captured plans.
      await runAndCapture(
        scenario.id,
        () =>
          listFailedImageDeliveryRepairMarkers({
            postIds: 'postIds' in scenario.input ? [...scenario.input.postIds] : undefined,
            imageIds: 'imageIds' in scenario.input ? [...scenario.input.imageIds] : undefined,
          }),
        undefined,
        'repairFailedImageDeliveryMutation',
        {
          afterCapture: async () => {
            const captured = getCapturedQueries().find(
              query => extractQueryName(query.text) === 'repairFailedImageDeliveryMutation',
            )
            assert.ok(captured, 'The real recovery selector must be captured')
            const markers = getCapturedQueries().find(
              query => extractQueryName(query.text) === 'repairFailedImageDeliveryMutation:markers',
            )
            assert.ok(markers, 'The production marker walk must be captured')
            const { rows: inspected } = await write<{ media_delivery_registry_record_id: string }>(
              `/* captureRecovery:assertMarkers */ ${markers.text}`,
              [...markers.values],
            )
            assert.deepEqual(
              inspected.map(row => row.media_delivery_registry_record_id),
              pageRecords,
            )
            assert.deepEqual(
              captured.values['postIds' in scenario.input ? 0 : 1],
              pageRecords,
              'Ownership probes must use the actual bounded marker walk output',
            )
            const { rows } = await write<{ media_delivery_registry_record_id: string }>(
              `/* captureRecovery:assertSelector */ ${captured.text}`,
              [...captured.values],
            )
            assert.deepEqual(
              rows
                .map(row => row.media_delivery_registry_record_id)
                .toSorted((a, b) => a.localeCompare(b)),
              scenario.expectedRecords
                .filter(id => pageRecords.includes(id))
                .toSorted((a, b) => a.localeCompare(b)),
              'Recovery must select exactly the owned records from the bounded oldest marker page',
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
