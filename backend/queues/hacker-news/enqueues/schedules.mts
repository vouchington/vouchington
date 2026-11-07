import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { QUEUE_NAME } from '../config.mts'
import { hackerNewsQueue } from '../queues.mts'

// An empty manifest removes undeclared schedules at worker startup.
export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(hackerNewsQueue, scheduledJobManifest)
}
