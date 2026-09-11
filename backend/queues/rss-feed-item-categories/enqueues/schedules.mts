import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_ID,
  CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_TTL_MS,
  PRIORITY_RECOVERY,
  QUEUE_NAME,
  RSS_FEED_ITEM_CATEGORY_ORDERING,
} from '../config.mts'
import { enqueueReconcileRssFeedItemCategorySnapshots } from '../enqueues.mts'
import { rssFeedItemCategories } from '../queues.mts'
import type { RssFeedItemCategoriesJobs } from '../types.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'reconcileRssFeedItemCategorySnapshots',
    registration: 'sequential',
    repeat: { every: 300_000 },
    stagingHourlyFloor: {
      bypassJustification: 'Five-minute recovery bounds durable category snapshots.',
    },
    template: {
      name: 'processReconcileRssFeedItemCategorySnapshots' as RssFeedItemCategoriesJobs,
      data: {},
      opts: {
        ...ENQUEUE_BASE_DEFAULTS,
        priority: PRIORITY_RECOVERY,
        ordering: RSS_FEED_ITEM_CATEGORY_ORDERING.snapshot_reconciliation,
        deduplication: {
          id: CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_ID,
          mode: 'throttle',
          ttl: CATEGORY_SNAPSHOT_RECOVERY_DEDUPLICATION_TTL_MS,
        },
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
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(rssFeedItemCategories, scheduledJobManifest)
}
