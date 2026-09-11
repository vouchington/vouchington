import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { BoilerplateRemovalJobs } from '../types.mts'
import { boilerplateRemovalQueue } from '../queues.mts'
import { BOILERPLATE_REMOVAL_QUEUE_NAME, PRIORITY_DISPATCHER } from '../config.mts'
import { enqueueBoilerplateRemovalDispatcher } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BOILERPLATE_REMOVAL_QUEUE_NAME, [
  {
    schedulerId: 'boilerplate_removal_dispatcher',
    repeat: { pattern: '0 5 * * *' },
    template: {
      name: 'boilerplate_removal_dispatcher' as BoilerplateRemovalJobs,
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DISPATCHER,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'boilerplate_removal_dispatcher',
        schedule: '0 5 * * *',
        description: 'Dispatch HTML boilerplate removal',
        trigger: enqueueBoilerplateRemovalDispatcher,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(boilerplateRemovalQueue, scheduledJobManifest)
}
