import type { JobOptions } from 'glide-mq'
import { MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS, PRIORITY_DISPATCHER } from '../config.mts'
import { enqueueRecoverMicrosoftStoreSources } from '../enqueues.mts'

export const microsoftStoreSchedules = [
  {
    schedulerId: 'microsoftStoreSourceRecovery',
    repeat: { every: MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS },
    template: {
      name: 'recoverMicrosoftStoreSources',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
        ordering: { key: 'microsoft-store-recovery', concurrency: 1 },
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'microsoftStoreSourceRecovery',
        schedule: 'every 1h',
        description: 'Recheck known Microsoft Store sources with usable credentials',
        trigger: enqueueRecoverMicrosoftStoreSources,
      },
    ],
  },
] as const
