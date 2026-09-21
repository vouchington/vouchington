import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { QUEUE_NAME } from '../config.mts'
import { wikipediaRecommenderSchedulerTombstone } from '../queues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(wikipediaRecommenderSchedulerTombstone, scheduledJobManifest)
}
