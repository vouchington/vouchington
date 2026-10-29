import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import { imagesWorkConfig, imagesWorkMaxValues } from '@services/images/work-limits'
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
      deletion_page_size: 'Posts reset or updates admitted per image deletion page.',
      recovery_threshold_hours: 'Recovery threshold hours for images processing.',
      abandoned_threshold_hours: 'Abandoned threshold hours for images processing.',
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
      hostname_invalidation_lease_seconds: 'Lease duration for hostname cache invalidation work.',
      hostname_invalidation_retry_ceiling_seconds:
        'Maximum backoff before retrying hostname cache invalidation.',
    },
  }),
  defineBoundedWorkNamespace({
    namespace: 'hostname-blocking-work-config',
    config: hostnameBlockingWorkConfig,
    label: 'Hostname Blocking',
    maxValues: hostnameBlockingWorkMaxValues,
    descriptions: {
      relation_delete_batch_size: 'Entity relation delete page size for hostname blocking.',
      hostname_scan_batch_size: 'Hostname family scan and subdomain projection page size.',
      url_scan_batch_size: 'URL registry scan page size for hostname blocking.',
      penalty_enqueue_batch_size: 'Vote-weight penalty enqueue page size for hostname blocking.',
      recovery_batch_size: 'Pending hostname block recovery page size.',
    },
  }),
]
