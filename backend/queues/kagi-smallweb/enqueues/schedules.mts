import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { KAGI_SMALLWEB_SYNC_JOB } from '@queues/background/enqueues/kagi-smallweb-jobs'
import { KAGI_SMALLWEB_CRON, KAGI_SMALLWEB_ORDERING } from '../config.mts'
import { enqueueKagiSmallWebSync } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'kagi-smallweb-sync',
    repeat: { pattern: KAGI_SMALLWEB_CRON },
    template: {
      name: KAGI_SMALLWEB_SYNC_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...KAGI_SMALLWEB_SYNC_JOB.options,
        ordering: KAGI_SMALLWEB_ORDERING.dispatcher,
      }),
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'kagi-smallweb-sync',
        schedule: KAGI_SMALLWEB_CRON,
        description: 'Sync Kagi Small Web data',
        trigger: enqueueKagiSmallWebSync,
      },
      { kind: 'backfill', backfillId: 'kagi-smallweb-sync' },
    ],
  },
])
