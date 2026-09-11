import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { Worker } from 'glide-mq'
import { QUEUE_NAME } from '@queues/story-post-related-url-projections/config'
import { processStoryPostRelatedUrlProjectionJob } from './processors.mts'

export const storyPostRelatedUrlProjections = new Worker(
  QUEUE_NAME,
  processStoryPostRelatedUrlProjectionJob,
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('storyPostRelatedUrlProjections', { baseline: 2 }),
  },
)
