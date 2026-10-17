import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  IMPORT_RECOVERY_CRON,
  IMPORTS_RECOVER_STALLED_JOB,
} from '@queues/background/enqueues/imports-jobs'
import { enqueueRecoverStalledImports } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'imports-recover-stalled',
    repeat: { pattern: IMPORT_RECOVERY_CRON },
    template: {
      name: IMPORTS_RECOVER_STALLED_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions(IMPORTS_RECOVER_STALLED_JOB.options),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'imports-recover-stalled',
        schedule: IMPORT_RECOVERY_CRON,
        description: 'Re-dispatch imports whose dispatcher failed',
        trigger: enqueueRecoverStalledImports,
      },
    ],
  },
])
