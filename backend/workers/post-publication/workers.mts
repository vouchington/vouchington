import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/post-publication/config'
import type { PostPublicationJobs } from '@queues/post-publication/types'
import type { Job } from 'glide-mq'
import * as processors from './processors.mts'

export const postPublication = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    const processor = processors[job.name as PostPublicationJobs]
    if (!processor) throw new Error(`Post publication job ${job.name} not found`)
    return processor(job.data)
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('postPublication', { baseline: 1 }),
  },
)
