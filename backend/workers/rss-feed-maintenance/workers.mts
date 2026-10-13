import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/rss-feed-maintenance/config'
import { processRssFeedMaintenanceJob } from './processors.mts'

export const rssFeedMaintenance = createWorker(QUEUE_NAME, processRssFeedMaintenanceJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('rssFeedMaintenance', { baseline: 10 }),
})
