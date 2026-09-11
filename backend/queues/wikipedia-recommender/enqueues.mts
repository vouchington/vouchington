import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import {
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
  WIKIPEDIA_RECOMMENDER_DEFAULTS,
  WIKIPEDIA_RECOMMENDER_ORDERING,
} from './config.mts'
import { wikipediaRecommender } from './queues.mts'

const enqueueWikipediaRecommenderDispatchJob = createEnqueueFunction<
  { scheduled_at: string },
  'dispatch'
>({
  queue: wikipediaRecommender,
  queueName: QUEUE_NAME,
  jobName: 'dispatch',
  defaults: {
    attempts: WIKIPEDIA_RECOMMENDER_DEFAULTS.attempts,
    backoff: WIKIPEDIA_RECOMMENDER_DEFAULTS.backoff,
    removeOnComplete: WIKIPEDIA_RECOMMENDER_DEFAULTS.removeOnComplete,
    removeOnFail: WIKIPEDIA_RECOMMENDER_DEFAULTS.removeOnFail,
  },
})

export function enqueueWikipediaRecommenderDispatch(): EnqueueReturnType {
  return enqueueWikipediaRecommenderDispatchJob(
    { scheduled_at: new Date().toISOString() },
    {
      priority: PRIORITY_DISPATCHER,
      ordering: WIKIPEDIA_RECOMMENDER_ORDERING.dispatcher,
    },
  )
}
