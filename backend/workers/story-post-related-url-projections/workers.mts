import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/story-post-related-url-projections/config'
import { processStoryPostRelatedUrlProjectionJob } from './processors.mts'

export const storyPostRelatedUrlProjections = createWorker(
  QUEUE_NAME,
  processStoryPostRelatedUrlProjectionJob,
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('storyPostRelatedUrlProjections', { baseline: 2 }),
  },
)
