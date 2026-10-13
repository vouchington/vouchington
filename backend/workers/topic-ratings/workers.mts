import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { updateTopicRatingStats } from '@services/topics'
import { TOPIC_RATINGS_QUEUE_NAME } from '@queues/topic-ratings/config'
import type { TopicRatingsJobData } from '@queues/topic-ratings/types'

export const topicRatings = createWorker(
  TOPIC_RATINGS_QUEUE_NAME,
  (job: Job) => {
    const jobName = job.name as TopicRatingsJobData['name']

    switch (jobName) {
      case 'processUpdateTopicRatingStats':
        return updateTopicRatingStats(job.data.topicId)
      default: {
        const exhaustiveCheck: never = jobName
        throw new Error(`Topic ratings job ${exhaustiveCheck} not found`)
      }
    }
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('topicRatings', { baseline: 5 }),
  },
)
