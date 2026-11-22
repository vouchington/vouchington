import {
  stuckResolutionRunExpiryConfig,
  stuckResolutionRunExpiryMaxValues,
} from '@services/moderation-ai-config/stuck-run-expiry'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

export const stuckResolutionRunExpiryRegistryEntry = defineBoundedWorkNamespace({
  namespace: 'stuck-resolution-run-expiry-config',
  config: stuckResolutionRunExpiryConfig,
  maxValues: stuckResolutionRunExpiryMaxValues,
  label: 'Stuck AI resolution run expiry',
  descriptions: {
    stuck_age_hours:
      'Hours an active report judgement, appeal or dispute AI run waits before it expires.',
    report_batch_size: 'Stuck report judgement runs expired per page.',
    report_max_batches: 'Pages of stuck report judgement runs expired by one scheduled job.',
    appeal_batch_size: 'Stuck appeal resolution runs expired per page.',
    appeal_max_batches: 'Pages of stuck appeal resolution runs expired by one scheduled job.',
    dispute_batch_size: 'Stuck dispute resolution runs expired per page.',
    dispute_max_batches: 'Pages of stuck dispute resolution runs expired by one scheduled job.',
  },
})
