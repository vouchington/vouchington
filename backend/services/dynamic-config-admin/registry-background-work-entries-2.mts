import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import { imagesWorkConfig, imagesWorkMaxValues } from '@services/images/work-limits'
import {
  openaiBackgroundResponsesWorkConfig,
  openaiBackgroundResponsesWorkMaxValues,
} from '@services/openai-background-responses/work-limits'
import {
  openaiModerationWorkConfig,
  openaiModerationWorkMaxValues,
} from '@services/openai-moderation/work-limits'
import { entityCacheWorkConfig, entityCacheWorkMaxValues } from '@services/entity-cache/work-limits'
import {
  hostnameBlockingWorkConfig,
  hostnameBlockingWorkMaxValues,
} from '@services/hostname-blocking/work-limits'

export const backgroundWorkEntries2 = [
  defineBoundedWorkNamespace({
    namespace: 'images-work-config',
    config: imagesWorkConfig,
    label: 'Images',
    maxValues: imagesWorkMaxValues,
    descriptions: {
      cleanup_batch_size: 'Cleanup batch size for images processing.',
      recovery_threshold_hours: 'Recovery threshold hours for images processing.',
      abandoned_threshold_hours: 'Abandoned threshold hours for images processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'openai-background-responses-work-config',
    config: openaiBackgroundResponsesWorkConfig,
    label: 'Openai Background Responses',
    maxValues: openaiBackgroundResponsesWorkMaxValues,
    descriptions: {
      reconcile_batch_size: 'Reconcile batch size for openai background responses processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'openai-moderation-work-config',
    config: openaiModerationWorkConfig,
    label: 'Openai Moderation',
    maxValues: openaiModerationWorkMaxValues,
    descriptions: {
      backfill_batch_size: 'Backfill batch size for openai moderation processing.',
      image_quarantine_batch_size: 'Image quarantine batch size for openai moderation processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'entity-cache-work-config',
    config: entityCacheWorkConfig,
    label: 'Entity Cache',
    maxValues: entityCacheWorkMaxValues,
    descriptions: {
      bloom_backfill_batch_size: 'Bloom backfill batch size for entity cache processing.',
      delete_keys_per_batch: 'Delete keys per batch for entity cache processing.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'hostname-blocking-work-config',
    config: hostnameBlockingWorkConfig,
    label: 'Hostname Blocking',
    maxValues: hostnameBlockingWorkMaxValues,
    descriptions: {
      post_related_url_delete_batch_size:
        'Post related url delete batch size for hostname blocking processing.',
    },
  }),
]
