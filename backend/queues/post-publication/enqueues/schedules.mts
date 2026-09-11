import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  POST_PUBLICATION_ORDERING,
  PRIORITY_RECONCILIATION,
  QUEUE_NAME,
  RECONCILIATION_DEDUPLICATION_ID,
  RECONCILIATION_DEDUPLICATION_TTL_MS,
} from '../config.mts'
import { enqueueReconcilePostPublication } from '../enqueues.mts'
import { postPublication } from '../queues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'reconcile-post-publication',
    registration: 'sequential',
    repeat: { every: 300_000 },
    stagingHourlyFloor: {
      bypassJustification: 'Five-minute recovery bounds immutable publication change work.',
    },
    template: {
      name: 'processReconcilePostPublication',
      data: {},
      opts: {
        ...ENQUEUE_BASE_DEFAULTS,
        priority: PRIORITY_RECONCILIATION,
        ordering: POST_PUBLICATION_ORDERING.reconciliation,
        deduplication: {
          id: RECONCILIATION_DEDUPLICATION_ID,
          mode: 'throttle',
          ttl: RECONCILIATION_DEDUPLICATION_TTL_MS,
        },
      },
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'reconcile-post-publication',
        schedule: 'every 5m',
        description: 'Drain durable post publication reconciliation work',
        trigger: enqueueReconcilePostPublication,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(postPublication, scheduledJobManifest)
}
