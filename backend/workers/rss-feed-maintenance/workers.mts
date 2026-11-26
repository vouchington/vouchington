import { createWorker, type NamedQueueJob } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@vouchington/utils/worker-concurrency'
import { QUEUE_NAME } from '@queues/rss-feed-maintenance/config'
import { processRssFeedMaintenanceJob } from './processors.mts'
import type { RssFeedMaintenanceJobPayloads } from '@queues/rss-feed-maintenance/types'

export const rssFeedMaintenance = createWorker<
  unknown,
  unknown,
  NamedQueueJob<RssFeedMaintenanceJobPayloads>
>(QUEUE_NAME, processRssFeedMaintenanceJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('rssFeedMaintenance', { baseline: 10 }),
})
