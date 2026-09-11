import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, TOPIC_RATINGS_QUEUE_NAME } from './config.mts'
import { topicRatings } from './queues.mts'
import type { TopicRatingsJobs } from './types.mts'

const JOB_NAME: TopicRatingsJobs = 'processUpdateTopicRatingStats'

const enqueueBulkUpdateTopicRatingStatsJobs = createBulkEnqueueFunction<
  string,
  { topicId: string },
  TopicRatingsJobs
>({
  queue: topicRatings,
  queueName: TOPIC_RATINGS_QUEUE_NAME,
  jobName: JOB_NAME,
  buildJob: topicId => ({
    data: { topicId },
    opts: {
      deduplication: {
        id: `${JOB_NAME}__${topicId}`,
        mode: 'debounce' as const,
        ttl: 1000 * 60 * 60 * 24,
      },
    },
  }),
})

export const enqueueBulkUpdateTopicRatingStatsForTopicId = (
  topicIds: string[],
  priority?: number,
): EnqueueReturnType => {
  if (topicIds.length === 0) return

  return enqueueBulkUpdateTopicRatingStatsJobs(topicIds, {
    priority: priority ?? PRIORITY_DEFAULT,
  } satisfies Partial<JobOptions>)
}
