import type { EnqueueReturnType } from '@voucha/types'
import { createBackgroundBulkEnqueue } from '@queues/background/enqueues'
import { VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'

const enqueueBulkUpdateTopicRatingStatsJobs = createBackgroundBulkEnqueue(
  VOTE_AGGREGATION_TOPIC_RATING_STATS_JOB,
  (topicId: string) => ({
    data: { topicId },
    opts: {
      deduplication: {
        id: `processUpdateTopicRatingStats__${topicId}`,
        mode: 'debounce' as const,
      },
    },
  }),
)

export const enqueueBulkUpdateTopicRatingStatsForTopicId = (
  topicIds: string[],
  priority?: number,
): EnqueueReturnType => {
  if (topicIds.length === 0) return Promise.resolve()

  return enqueueBulkUpdateTopicRatingStatsJobs(topicIds, priority === undefined ? {} : { priority })
}
