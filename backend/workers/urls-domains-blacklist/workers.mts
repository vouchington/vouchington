import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/urls-domains-blacklist/config'
import * as processors from './processors.mts'
import type { ProcessorJobs } from '@queues/urls-domains-blacklist/types'
import type { Job } from 'glide-mq'

export const urlsDomainsBlacklist = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    const fn = processors[job.name as ProcessorJobs]
    if (!fn) throw new Error(`Job ${job.name} not found`)
    return fn(job.data)
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('urlsDomainsBlacklist', { baseline: 5 }),
  },
)
