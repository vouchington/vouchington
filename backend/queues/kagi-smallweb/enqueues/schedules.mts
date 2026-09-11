import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { kagiSmallWeb } from '../queues.mts'
import {
  KAGI_SMALLWEB_CRON,
  KAGI_SMALLWEB_DEFAULTS,
  KAGI_SMALLWEB_ORDERING,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import type { KagiSmallWebDispatcherJobs } from '../types.mts'
import { enqueueKagiSmallWebSync } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'kagi-smallweb-sync',
    repeat: { pattern: KAGI_SMALLWEB_CRON },
    template: {
      name: 'sync' as KagiSmallWebDispatcherJobs,
      data: {},
      opts: {
        attempts: KAGI_SMALLWEB_DEFAULTS.attempts,
        backoff: KAGI_SMALLWEB_DEFAULTS.backoff,
        removeOnComplete: KAGI_SMALLWEB_DEFAULTS.removeOnComplete,
        removeOnFail: KAGI_SMALLWEB_DEFAULTS.removeOnFail,
        priority: PRIORITY_DISPATCHER,
        ordering: KAGI_SMALLWEB_ORDERING.dispatcher,
      } satisfies JobOptions,
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

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(kagiSmallWeb, scheduledJobManifest)
}
