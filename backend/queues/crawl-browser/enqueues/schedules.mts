import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { CRAWL_BROWSER_QUEUE_NAME } from '../config.mts'
import { crawlBrowserQueue } from '../queues.mts'

// An empty manifest still removes undeclared schedules at worker startup.
export const scheduledJobManifest = defineScheduledJobManifest(CRAWL_BROWSER_QUEUE_NAME, [])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(crawlBrowserQueue, scheduledJobManifest)
}
