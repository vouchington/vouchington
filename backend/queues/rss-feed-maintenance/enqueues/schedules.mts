import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  PRIORITY_RECOVERY,
  QUEUE_NAME,
  RSS_FEED_ITEM_CATEGORY_ORDERING,
  TOPIC_ALIAS_ORDERING,
} from '../config.mts'
import { enqueueReconcileRssFeedItemCategorySnapshots } from './item-categories.mts'
import { enqueueReconcileTopicAliasCategoryMappings } from './topic-aliases.mts'
import { rssFeedMaintenance } from '../queues.mts'
import type { RssFeedItemCategoriesJobs } from '../types.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'reconcileRssFeedItemCategorySnapshots',
    registration: 'sequential',
    repeat: { every: 300_000 },
    template: {
      name: 'processReconcileRssFeedItemCategorySnapshots' as RssFeedItemCategoriesJobs,
      data: {},
      opts: {
        ...ENQUEUE_BASE_DEFAULTS,
        priority: PRIORITY_RECOVERY,
        ordering: RSS_FEED_ITEM_CATEGORY_ORDERING.snapshot_reconciliation,
      },
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcileRssFeedItemCategorySnapshots',
        schedule: 'every 5m',
        description: 'Drain durable RSS item category snapshots',
        trigger: enqueueReconcileRssFeedItemCategorySnapshots,
      },
    ],
  },
  {
    schedulerId: 'reconcileTopicAliasCategoryMappings',
    registration: 'sequential',
    repeat: { every: 300_000 },
    template: {
      name: 'processReconcileTopicAliasCategoryMappings',
      data: {},
      opts: {
        ...ENQUEUE_BASE_DEFAULTS,
        priority: PRIORITY_RECOVERY,
        ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
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
  await upsertScheduledJobManifest(rssFeedMaintenance, scheduledJobManifest)
}
