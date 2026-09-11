import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { PRIORITY_DISPATCHER, QUEUE_NAME } from '../config.mts'
import { voteWeightQueue } from '../queues.mts'
import { enqueueRecalculateVoteWeightDispatcher } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'dailyVoteWeightRecalculation',
    repeat: { pattern: '0 4 * * *' },
    template: {
      name: 'processRecalculateVoteWeightDispatcher',
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
        id: 'dailyVoteWeightRecalculation',
        schedule: '0 4 * * *',
        description: 'Recalculate vote weights',
        trigger: enqueueRecalculateVoteWeightDispatcher,
      },
      { kind: 'backfill', backfillId: 'vote-weight-dispatch' },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(voteWeightQueue, scheduledJobManifest)
}
