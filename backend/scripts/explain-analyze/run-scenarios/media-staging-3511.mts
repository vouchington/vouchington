import { stageImagePlacementDeliveryRecordPage } from '@services/media-delivery-safety/delivery-registry-staging-page'
import { MEDIA_REPLAY_RECORD_COUNT } from '../seed-data/media-delivery-replay-cohort.mts'
import { seedUuid } from '../seed-data/common.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

/** A late tuple cursor leaves ten records in the 12k-record replay fixture. */
export async function runMediaStaging3511Scenario(): Promise<void> {
  registerScenarioContract('media-delivery-staging-tuple-page', {
    seededRows: { media_delivery_registry_records: MEDIA_REPLAY_RECORD_COUNT },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'media_delivery_registry_records', max: 50 },
      { kind: 'maxProcessedRows', relation: 'media_placements', max: 50 },
      { kind: 'maxProcessedRows', relation: 'image_placements', max: 50 },
      { kind: 'maxProcessedRows', relation: 'image_surface_placements', max: 50 },
    ],
  })
  await runAndCapture(
    'media-delivery-staging-tuple-page',
    async () => {
      const page = await stageImagePlacementDeliveryRecordPage({
        after: {
          placement_id: seedUuid(MEDIA_REPLAY_RECORD_COUNT - 11, 'fc'),
          placement_revision: 0,
          image_id: seedUuid(10, 'fd'),
        },
      })
      if (!page.after) throw new Error('Expected a staged tuple continuation')
    },
    undefined,
    'stageImagePlacementDeliveryRecordPage',
  )
}
