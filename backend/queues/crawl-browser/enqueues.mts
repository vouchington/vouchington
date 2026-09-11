import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { CRAWL_BROWSER_DEFAULTS, CRAWL_BROWSER_QUEUE_NAME, PRIORITY_DEFAULT } from './config.mts'
import { crawlBrowserQueue } from './queues.mts'
import type { CrawlBrowserJobData, CrawlBrowserJobs } from './types.mts'

const enqueueCrawlBrowserJob = createEnqueueFunction<CrawlBrowserJobData, CrawlBrowserJobs>({
  queue: crawlBrowserQueue,
  queueName: CRAWL_BROWSER_QUEUE_NAME,
  jobName: 'crawl_browser',
  defaults: {
    attempts: CRAWL_BROWSER_DEFAULTS.attempts,
    backoff: CRAWL_BROWSER_DEFAULTS.backoff,
    removeOnComplete: CRAWL_BROWSER_DEFAULTS.removeOnComplete,
    removeOnFail: CRAWL_BROWSER_DEFAULTS.removeOnFail,
  } satisfies Partial<JobOptions>,
})

export function enqueueCrawlBrowser(data: CrawlBrowserJobData): EnqueueReturnType {
  return enqueueCrawlBrowserJob(data, {
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `crawl_browser__${data.linkId}__${data.urlId}`,
      mode: 'debounce' as const,
      ttl: 120_000,
    },
  })
}
