import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { QUEUE_NAME } from '../config.mts'
import { PRIORITY_DEFAULT } from './config-topic-ratings.mts'
import { voteAggregation } from '../queues.mts'
import type { TopicRatingsJobs } from './types-topic-ratings.mts'

const JOB_NAME: TopicRatingsJobs = 'processUpdateTopicRatingStats'

const enqueueBulkUpdateTopicRatingStatsJobs = createBulkEnqueueFunction<
  string,
  { topicId: string },
  TopicRatingsJobs
>({
  queue: voteAggregation,
  queueName: QUEUE_NAME,
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
  if (topicIds.length === 0) return Promise.resolve()

  return enqueueBulkUpdateTopicRatingStatsJobs(topicIds, {
    priority: priority ?? PRIORITY_DEFAULT,
  } satisfies Partial<JobOptions>)
}
