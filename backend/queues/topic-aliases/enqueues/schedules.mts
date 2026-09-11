import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  PRIORITY_RECOVERY,
  QUEUE_NAME,
  CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_ID,
  CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_TTL_MS,
  TOPIC_ALIAS_ORDERING,
} from '../config.mts'
import { enqueueReconcileTopicAliasCategoryMappings } from '../enqueues.mts'
import { topicAliases } from '../queues.mts'
import type { TopicAliasJobs } from '../types.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'reconcileTopicAliasCategoryMappings',
    registration: 'sequential',
    repeat: { every: 300_000 },
    stagingHourlyFloor: {
      bypassJustification: 'Five-minute reconciliation bounds durable alias-transition recovery.',
    },
    template: {
      name: 'processReconcileTopicAliasCategoryMappings' as TopicAliasJobs,
      data: {},
      opts: {
        ...ENQUEUE_BASE_DEFAULTS,
        priority: PRIORITY_RECOVERY,
        ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
        deduplication: {
          id: CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_ID,
          mode: 'throttle',
          ttl: CATEGORY_MAPPING_RECOVERY_DEDUPLICATION_TTL_MS,
        },
      },
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcileTopicAliasCategoryMappings',
        schedule: 'every 5m',
        description: 'Drain durable RSS category-mapping transitions for hashtag aliases',
        trigger: enqueueReconcileTopicAliasCategoryMappings,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(topicAliases, scheduledJobManifest)
}
