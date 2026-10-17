import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { QUEUE_NAME } from '../config.mts'
import { emails } from '../queues.mts'
import { drainFailedLegacyEmailDigestJobs } from './legacy-digest-rehome.mts'

// An empty manifest still removes the digest schedulers that used to live on this queue.
export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(emails, scheduledJobManifest)
  await drainFailedLegacyEmailDigestJobs()
}
