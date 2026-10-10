import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { QUEUE_NAME } from '../config.mts'
import { bloomFilters } from '../queues.mts'

// An empty manifest still removes previously registered rebuild schedules at worker startup.
export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(bloomFilters, scheduledJobManifest)
}
