import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  GLIDE_MQ_STATS_JOB_NAME,
  GLIDE_MQ_STATS_JOB_OPTIONS,
  QUEUE_NAME,
} from '@queues/heartbeat/config'
import { enqueueGlideMqStats } from '@queues/heartbeat/enqueues'
import { heartbeat } from '@queues/heartbeat/queues'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'publish-glidemq-stats',
    registration: 'sequential',
    repeat: { every: 300_000 },
    stagingHourlyFloor: {
      bypassJustification: 'Five-minute telemetry bounds queue-staleness detection to ten minutes.',
    },
    template: {
      name: GLIDE_MQ_STATS_JOB_NAME,
      data: {},
      opts: GLIDE_MQ_STATS_JOB_OPTIONS,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'publish-glidemq-stats',
        schedule: 'every 5m',
        description: 'Publish class-aggregated GlideMQ depth and staleness to CloudWatch',
        trigger: enqueueGlideMqStats,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(heartbeat, scheduledJobManifest)
}
