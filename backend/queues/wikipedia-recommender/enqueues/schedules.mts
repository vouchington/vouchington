import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { wikipediaRecommenderSchedulerTombstone } from '../queues.mts'

export const scheduledJobManifest = defineScheduledJobManifest('wikipedia-recommender', [])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(wikipediaRecommenderSchedulerTombstone, scheduledJobManifest)
}
