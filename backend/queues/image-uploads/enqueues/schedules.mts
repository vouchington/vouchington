import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { IMAGE_UPLOADS_QUEUE_NAME } from '../config.mts'
import { imageUploadsQueue } from '../queues.mts'

// An empty manifest still removes undeclared schedules at worker startup.
export const scheduledJobManifest = defineScheduledJobManifest(IMAGE_UPLOADS_QUEUE_NAME, [])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(imageUploadsQueue, scheduledJobManifest)
}
