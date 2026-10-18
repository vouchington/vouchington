import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { enqueueCleanupAbandonedUploads } from './image-jobs.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_CPU_QUEUE_NAME, [
  {
    schedulerId: 'content-analysis:cleanup-abandoned-uploads-schedule',
    repeat: { every: 3_600_000 },
    template: {
      name: 'content-analysis.cleanup-abandoned-uploads',
      data: {},
      opts: {
        ...requireBackgroundCpuJob('content-analysis.cleanup-abandoned-uploads').options,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'content-analysis:cleanup-abandoned-uploads-schedule',
        schedule: 'every 1h',
        description: 'Clean up abandoned image uploads',
        trigger: enqueueCleanupAbandonedUploads,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(backgroundCpu, scheduledJobManifest)
}
