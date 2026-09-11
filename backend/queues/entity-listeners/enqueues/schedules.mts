import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  ENTITY_LISTENER_ORDERING,
  getEntityListenerReconciliationIntervalSeconds,
  POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_ID,
  POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_TTL_MS,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { entitiesListeners } from '../queues.mts'
import { enqueueReconcilePostCategoryFinalizations } from './reconciliation.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'reconcilePostCategoryFinalizations',
    registration: 'sequential',
    repeat: { every: 300_000 },
    stagingHourlyFloor: {
      bypassJustification: 'Five-minute recovery bounds durable post category finalizations.',
    },
    template: {
      name: 'processReconcilePostCategoryFinalizations',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
        ordering: ENTITY_LISTENER_ORDERING.post_category_finalization_reconciliation,
        deduplication: {
          id: POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_ID,
          mode: 'throttle',
          ttl: POST_CATEGORY_FINALIZATION_RECONCILIATION_DEDUPLICATION_TTL_MS,
        },
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcilePostCategoryFinalizations',
        schedule: 'every 5m',
        description: 'Drain durable post category finalizations',
        trigger: enqueueReconcilePostCategoryFinalizations,
      },
    ],
  },
  {
    schedulerId: 'entityListenerReconciliation',
    repeat: () => ({ every: getEntityListenerReconciliationIntervalSeconds() * 1000 }),
    template: {
      name: 'reconcileEntities',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
    },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'entity-listener-reconciliation' }],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(entitiesListeners, scheduledJobManifest)
}
