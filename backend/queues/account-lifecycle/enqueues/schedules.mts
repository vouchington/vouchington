import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import {
  CLEANUP_SCHEDULER_ID,
  CLEANUP_CRON,
  USER_DELETIONS_RECOVERY_INTERVAL_MS,
} from '../config.mts'
import { enqueueCleanupExpiredExports } from './account-data-requests.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: CLEANUP_SCHEDULER_ID,
    repeat: { pattern: CLEANUP_CRON },
    template: {
      name: ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.options }),
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
      name: ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.options }),
    },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'account-data-request-recovery' }],
  },
  {
    schedulerId: 'userDeletionRecovery',
    repeat: { every: USER_DELETIONS_RECOVERY_INTERVAL_MS },
    template: {
      name: ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB.options }),
    },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'user-deletion-recovery' }],
  },
])
