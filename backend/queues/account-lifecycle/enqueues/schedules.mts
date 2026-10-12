import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  CLEANUP_SCHEDULER_ID,
  CLEANUP_CRON,
  PRIORITY_DEFAULT,
  QUEUE_NAME,
  USER_DELETIONS_RECOVERY_INTERVAL_MS,
} from '../config.mts'
import { accountLifecycle } from '../queues.mts'
import { enqueueCleanupExpiredExports } from './account-data-requests.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
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
  await upsertScheduledJobManifest(accountLifecycle, scheduledJobManifest)
}
