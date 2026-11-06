import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  QUEUE_NAME,
  REPAIR_JOB,
  READMISSION_JOB,
  hackerNewsFlagsConfig,
  getHackerNewsFlagsLimit,
  getHackerNewsFlagsOrdering,
} from '../config.mts'
import { enqueueHackerNewsFlagRepair, enqueueHackerNewsLookupReadmission } from '../enqueues.mts'
import { hackerNewsFlagsQueue } from '../queues.mts'
export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: READMISSION_JOB,
    repeat: () => ({ every: getHackerNewsFlagsLimit('readmission_interval_seconds') * 1000 }),
    template: {
      name: READMISSION_JOB,
      data: { kind: 'readmission' },
      opts: () => ({
        ...ENQUEUE_BASE_DEFAULTS,
        priority: 0,
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: true,
        ordering: getHackerNewsFlagsOrdering('readmission'),
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: READMISSION_JOB,
        schedule: 'Dynamic interval',
        description: 'Readmit due Hacker News refreshes in bounded pages',
        trigger: enqueueHackerNewsLookupReadmission,
      },
    ],
  },
  {
    schedulerId: REPAIR_JOB,
    repeat: () => ({ every: getHackerNewsFlagsLimit('repair_interval_seconds') * 1000 }),
    template: {
      name: REPAIR_JOB,
      data: { kind: 'repair' },
      opts: () => ({
        ...ENQUEUE_BASE_DEFAULTS,
        priority: 0,
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: true,
        ordering: getHackerNewsFlagsOrdering('repair'),
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: REPAIR_JOB,
        schedule: 'Dynamic interval',
        description: 'Repair Hacker News filter flags in bounded pages',
        trigger: enqueueHackerNewsFlagRepair,
      },
    ],
  },
])
export async function upsertSchedules(): Promise<void> {
  await hackerNewsFlagsConfig.waitForInitialization()
  await upsertScheduledJobManifest(hackerNewsFlagsQueue, scheduledJobManifest)
}
