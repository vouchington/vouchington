import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '../config.mts'
import { enqueueHostnameBlockRecovery } from './hostname-blocking.mts'
import {
  HOSTNAME_BLOCKING_ORDERING,
  HOSTNAME_BLOCKING_RECOVERY_JOB,
  HOSTNAME_BLOCKING_RECOVERY_SCHEDULE,
} from './hostname-blocking-jobs.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'hostnameBlockingRecovery',
    repeat: { pattern: HOSTNAME_BLOCKING_RECOVERY_SCHEDULE },
    template: {
      name: HOSTNAME_BLOCKING_RECOVERY_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...HOSTNAME_BLOCKING_RECOVERY_JOB.options,
        ordering: HOSTNAME_BLOCKING_ORDERING.dispatcher,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'hostnameBlockingRecovery',
        schedule: HOSTNAME_BLOCKING_RECOVERY_SCHEDULE,
        description: 'Recover pending hostname-block relation cleanup',
        trigger: enqueueHostnameBlockRecovery,
      },
    ],
  },
])
