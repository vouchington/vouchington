import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { contentAnalysisQueue } from '../queues.mts'
import { CONTENT_ANALYSIS_QUEUE_NAME } from '../config.mts'
import { enqueueCleanupAbandonedUploads } from './image-jobs.mts'

export const scheduledJobManifest = defineScheduledJobManifest(CONTENT_ANALYSIS_QUEUE_NAME, [
  {
    schedulerId: 'content-analysis:cleanup-abandoned-uploads-schedule',
    repeat: { every: 3_600_000 },
    template: {
      name: 'cleanup-abandoned-uploads',
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: 100,
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
  await upsertScheduledJobManifest(contentAnalysisQueue, scheduledJobManifest)
}
