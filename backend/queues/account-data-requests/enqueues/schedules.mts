import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { CLEANUP_SCHEDULER_ID, CLEANUP_CRON, PRIORITY_DEFAULT } from '../config.mts'
import { accountDataRequests } from '../queues.mts'
import { enqueueCleanupExpiredExports } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest('account-data-requests', [
  {
    schedulerId: CLEANUP_SCHEDULER_ID,
    repeat: { pattern: CLEANUP_CRON },
    template: {
      name: 'processCleanupExpiredExports',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: PRIORITY_DEFAULT,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: CLEANUP_SCHEDULER_ID,
        schedule: CLEANUP_CRON,
        description: 'Clean up expired data export files',
        trigger: enqueueCleanupExpiredExports,
      },
    ],
  },
  {
    schedulerId: 'accountDataRequestRecovery',
    repeat: { every: 300_000 },
    template: {
      name: 'recoverExportRequests',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: 100,
      } satisfies JobOptions,
    },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'account-data-request-recovery' }],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(accountDataRequests, scheduledJobManifest)
}
