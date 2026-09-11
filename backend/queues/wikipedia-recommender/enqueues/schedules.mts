import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { wikipediaRecommender } from '../queues.mts'
import {
  CRON_PATTERN,
  WIKIPEDIA_RECOMMENDER_ORDERING,
  WIKIPEDIA_RECOMMENDER_DEFAULTS,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { enqueueWikipediaRecommenderDispatch } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'wikipedia-recommender-dispatch',
    repeat: { pattern: CRON_PATTERN },
    template: {
      name: 'dispatch',
      dataFactory: () => ({ scheduled_at: new Date().toISOString() }),
      opts: {
        attempts: WIKIPEDIA_RECOMMENDER_DEFAULTS.attempts,
        backoff: WIKIPEDIA_RECOMMENDER_DEFAULTS.backoff,
        removeOnComplete: WIKIPEDIA_RECOMMENDER_DEFAULTS.removeOnComplete,
        removeOnFail: WIKIPEDIA_RECOMMENDER_DEFAULTS.removeOnFail,
        priority: PRIORITY_DISPATCHER,
        ordering: WIKIPEDIA_RECOMMENDER_ORDERING.dispatcher,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'wikipedia-recommender-dispatch',
        schedule: CRON_PATTERN,
        description: 'Dispatch Wikipedia topic recommendations',
        trigger: enqueueWikipediaRecommenderDispatch,
      },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(wikipediaRecommender, scheduledJobManifest)
}
