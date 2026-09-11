import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/follower-distributions/config'
import type { FollowerDistributionJobs } from '@queues/follower-distributions/types'
import * as processors from './processors.mts'

export const followerDistributionsWorker = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    const fn = processors[job.name as FollowerDistributionJobs]
    if (!fn || typeof fn !== 'function') {
      throw new Error(`Follower distribution job ${job.name} not found`)
    }
    return fn(job.data as never)
  },
  {
    concurrency: getWorkerConcurrency('followerDistributions', { baseline: 5 }),
  },
)
