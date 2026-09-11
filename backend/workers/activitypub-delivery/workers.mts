import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/activitypub-delivery/config'
import type { ActivityPubDeliveryJobs } from '@queues/activitypub-delivery/types'
import * as processors from './processors.mts'

export const activitypubDeliveryWorker = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    const fn = processors[job.name as ActivityPubDeliveryJobs]
    if (!fn || typeof fn !== 'function') {
      throw new Error(`ActivityPub delivery job ${job.name} not found`)
    }
    return fn(job.data as never)
  },
  {
    concurrency: getWorkerConcurrency('activitypubDelivery', { baseline: 5 }),
  },
)
