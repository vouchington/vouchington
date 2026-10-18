import { pagedDispatchBackoffStrategies } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import {
  PAGED_DISPATCHER_MAX_STALLED_COUNT,
  withPagedDispatcherStallBudget,
} from '@data-stores/valkey-glide-mq/worker-stall-budget'
import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/crawl-dispatch/config'
import { processCrawlDispatchJob } from './processors.mts'

export const crawlDispatch = createWorker(
  QUEUE_NAME,
  withPagedDispatcherStallBudget(QUEUE_NAME, processCrawlDispatchJob),
  {
    dedicatedCommandClient: true,
    backoffStrategies: pagedDispatchBackoffStrategies(),
    maxStalledCount: PAGED_DISPATCHER_MAX_STALLED_COUNT,
    concurrency: getWorkerConcurrency('crawlDispatch', { baseline: 8 }),
  },
)
