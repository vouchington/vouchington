import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { QUEUE_NAME } from '../config.mts'
import { emails } from '../queues.mts'

// An empty manifest still removes undeclared schedules at worker startup.
export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(emails, scheduledJobManifest)
}
