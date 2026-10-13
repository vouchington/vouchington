import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import * as processors from './processors.mts'
import type { TopicAliasJobs } from '@queues/topic-aliases/types'
import { QUEUE_NAME } from '@queues/topic-aliases/config'

export const topicAliases = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    const fn = processors[job.name as TopicAliasJobs]
    if (!fn || typeof fn !== 'function') throw new Error(`Topic alias job ${job.name} not found`)
    if (!job.data) throw new Error('Topic alias job .data is required')
    return fn(job.data)
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('topicAliases', { baseline: 5 }),
  },
)
