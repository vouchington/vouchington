import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { processRssFeedsJob } from './processors.mts'
import { QUEUE_NAME } from '@queues/rss-feeds/config'

export const rss_feeds = createWorker(QUEUE_NAME, processRssFeedsJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('rssFeeds', { baseline: 5 }),
})
