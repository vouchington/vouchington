import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { USER_DELETIONS_RECOVERY_INTERVAL_MS } from '../config.mts'
import { enqueueRecoverUserDeletions } from '../enqueues.mts'
import { userDeletions } from '../queues.mts'

export const scheduledJobManifest = defineScheduledJobManifest('user-deletions', [
  {
    schedulerId: 'userDeletionRecovery',
    repeat: { every: USER_DELETIONS_RECOVERY_INTERVAL_MS },
    template: {
      name: 'recoverUserDeletions',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: 100,
      } satisfies JobOptions,
    },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'user-deletion-recovery' }],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(userDeletions, scheduledJobManifest)
}

export { enqueueRecoverUserDeletions }
