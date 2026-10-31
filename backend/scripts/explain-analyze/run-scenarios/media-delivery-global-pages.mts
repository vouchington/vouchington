import { seedUuid } from '../seed-data/common.mts'
import { MEDIA_REPLAY_RECORD_COUNT } from '../seed-data/media-delivery-replay.mts'
import { stageImagePlacementDeliveryRecordPage } from '@services/media-delivery-safety/delivery-registry-staging-page'
import { cleanupRetainedMediaBindings } from '@services/data-retention/cleanup-retained-media-bindings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const scanBefore = '2035-01-01T00:00:00.000Z'

export async function runMediaDeliveryGlobalPageScenarios(): Promise<void> {
  let first: Awaited<ReturnType<typeof stageImagePlacementDeliveryRecordPage>> | undefined
  registerScenarioContract('media-delivery-staging-global-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'image_placements_pkey',
          'media_placements_pkey',
          'media_delivery_registry_recor_placement_id_placement_revisi_key',
        ],
      },
      { kind: 'maxProcessedRows', relation: 'media_delivery_registry_records', max: 3_100 },
      { kind: 'maxProcessedRows', relation: 'image_placements', max: 2_100 },
      { kind: 'maxProcessedRows', relation: 'media_placements', max: 2_100 },
    ],
    seededRows: { media_delivery_registry_records: 19_000 },
  })
  await runAndCapture(
    'media-delivery-staging-global-page',
    async () => {
      first = await stageImagePlacementDeliveryRecordPage({ scanBefore })
    },
    undefined,
    'stageImagePlacementDeliveryRecordPage',
  )
  if (!first?.after || !first.hasMore)
    throw new Error('Global media staging fixture needs continuation')
  const after = first.after
  registerScenarioContract('media-delivery-staging-global-continuation', {
    expectations: [
      { kind: 'queryBinds', token: 'placement_id' },
      {
        kind: 'usesIndexes',
        indexes: [
          'image_placements_pkey',
          'media_placements_pkey',
          'media_delivery_registry_recor_placement_id_placement_revisi_key',
        ],
      },
      { kind: 'maxProcessedRows', relation: 'media_delivery_registry_records', max: 3_100 },
      { kind: 'maxProcessedRows', relation: 'image_placements', max: 2_100 },
      { kind: 'maxProcessedRows', relation: 'media_placements', max: 2_100 },
    ],
    seededRows: { media_delivery_registry_records: 19_000 },
  })
  await runAndCapture(
    'media-delivery-staging-global-continuation',
    () => stageImagePlacementDeliveryRecordPage({ scanBefore, after }),
    undefined,
    'stageImagePlacementDeliveryRecordPage',
  )
  registerScenarioContract('retention-retained-media-bindings-global', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'retained_image_placement_bind_placement_id_image_id_binding_key',
          'retained_image_placement_bindings_def_placement_id_image_id_key',
          'retained_image_placement_bindings_default_pkey',
        ],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'retained_image_placement_bindings', max: 25 },
    ],
    seededRows: { retained_image_placement_bindings: 17_000 },
  })
  await runAndCapture(
    'retention-retained-media-bindings-global',
    () => cleanupRetainedMediaBindings(20),
    undefined,
    'listRetainedMediaBindingCleanupCandidates',
  )
  registerScenarioContract('retention-retained-media-bindings-continuation', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'retained_image_placement_bind_placement_id_image_id_binding_key',
          'retained_image_placement_bindings_def_placement_id_image_id_key',
          'retained_image_placement_bindings_default_pkey',
        ],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'retained_image_placement_bindings', max: 25 },
    ],
    seededRows: { retained_image_placement_bindings: 17_000 },
  })
  await runAndCapture(
    'retention-retained-media-bindings-continuation',
    () => cleanupRetainedMediaBindings(20),
    undefined,
    'listRetainedMediaBindingCleanupCandidates',
  )
}

export async function runMediaDeliveryScopedPageScenarios(): Promise<void> {
  registerScenarioContract('media-delivery-staging-page', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_media_delivery_registry_records__image'] },
      { kind: 'maxProcessedRows', relation: 'media_delivery_registry_records', max: 175 },
      { kind: 'maxProcessedRows', relation: 'image_placements', max: 50 },
    ],
    seededRows: { media_delivery_registry_records: MEDIA_REPLAY_RECORD_COUNT },
  })
  await runAndCapture(
    'media-delivery-staging-page',
    () =>
      stageImagePlacementDeliveryRecordPage({
        imageIds: Array.from({ length: 50 }, (_, index) => seedUuid(index, 'fd')),
        scanBefore: '2035-01-01T00:00:00.000Z',
      }),
    undefined,
    'stageImagePlacementDeliveryRecordPage',
  )
  registerScenarioContract('retention-retained-media-bindings', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'retained_image_placement_bind_placement_id_image_id_binding_key',
          'retained_image_placement_bindings_def_placement_id_image_id_key',
          'retained_image_placement_bindings_default_image_id_idx',
          'retained_image_placement_bindings_default_pkey',
        ],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'retained_image_placement_bindings', max: 25 },
    ],
    seededRows: { retained_image_placement_bindings: MEDIA_REPLAY_RECORD_COUNT },
  })
  await runAndCapture(
    'retention-retained-media-bindings',
    () =>
      cleanupRetainedMediaBindings(
        20,
        Array.from({ length: 20 }, (_, index) =>
          seedUuid(MEDIA_REPLAY_RECORD_COUNT - index - 1, 'fc'),
        ),
      ),
    undefined,
    [
      'listRetainedMediaBindingCleanupCandidates',
      'lockRetainedMediaBindingImages',
      'lockRetainedMediaBindings',
    ],
  )
}
