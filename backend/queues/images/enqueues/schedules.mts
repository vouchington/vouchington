import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { imagesQueue } from '../queues.mts'
import { IMAGES_QUEUE_NAME, PRIORITY_DEFAULT } from '../config.mts'
import { enqueueCleanupAbandonedUploads } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(IMAGES_QUEUE_NAME, [
  {
    schedulerId: 'cleanup-abandoned-uploads-schedule',
    repeat: { every: 3_600_000 },
    template: {
      name: 'cleanup-abandoned-uploads',
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
        id: 'cleanup-abandoned-uploads-schedule',
        schedule: 'every 1h',
        description: 'Clean up abandoned image uploads',
        trigger: enqueueCleanupAbandonedUploads,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(imagesQueue, scheduledJobManifest)
}
