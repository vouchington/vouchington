import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  getEntityListenerReconciliationIntervalSeconds,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { entitiesListeners } from '../queues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'entityListenerReconciliation',
    repeat: () => ({ every: getEntityListenerReconciliationIntervalSeconds() * 1000 }),
    template: {
      name: 'enqueueReconcileEntities',
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
