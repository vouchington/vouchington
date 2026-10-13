import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import * as processors from './processors.mts'
import type { RssFeedItemCategoriesJobs } from '@queues/rss-feed-item-categories/types'
import { QUEUE_NAME } from '@queues/rss-feed-item-categories/config'

export const rssFeedItemCategories = createWorker(
  QUEUE_NAME,
  (job: Job) => {
    const fn = processors[job.name as RssFeedItemCategoriesJobs]
    if (!fn || typeof fn !== 'function')
      throw new Error(`RSS Feed Item Categories job ${job.name} not found`)
    if (!job.data) throw new Error('RSS Feed Item Categories job .data is required')
    return fn(job.data)
  },
  {
    dedicatedCommandClient: true,
    concurrency: getWorkerConcurrency('rssFeedItemCategories', { baseline: 5 }),
  },
)
