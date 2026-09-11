import { Worker, type Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { processPostMentions } from '@services/post-mentions'
import { QUEUE_NAME } from '@queues/post-mentions/config'
import type { PostMentionsJobs } from '@queues/post-mentions/types'

const processors: Record<PostMentionsJobs, (data: { postId: string }) => Promise<void>> = {
  processPostMentions,
}

export const postMentions = new Worker(
  QUEUE_NAME,
  (job: Job) => {
    const fn = processors[job.name as PostMentionsJobs]
    if (!fn) {
      throw new Error(`Post mentions job ${job.name} not found`)
    }
    if (!job.data) {
      throw new Error('Post mentions job .data is required')
    }
    return fn(job.data)
  },
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('postMentions', { baseline: 5 }),
  },
)
