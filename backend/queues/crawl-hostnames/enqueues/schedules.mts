import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { CrawlHostnamesJobs } from '../types.mts'
import { crawlHostnamesQueue } from '../queues.mts'
import { CRAWL_HOSTNAMES_QUEUE_NAME, PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from '../config.mts'
import {
  enqueueCrawlCleanup,
  enqueueCrawlHostnamesDispatcher,
  enqueueCrawlTier1Dispatcher,
  enqueueCrawlTier2Dispatcher,
  enqueueRefreshHostnameCrawlerDispatcher,
} from '../enqueues.mts'

const DEFAULT_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}

export const scheduledJobManifest = defineScheduledJobManifest(CRAWL_HOSTNAMES_QUEUE_NAME, [
  crawlJob(
    'crawl_hostnames_dispatcher',
    '0 2 * * *',
    PRIORITY_DISPATCHER,
    'Dispatch hostname crawl jobs (daily)',
    enqueueCrawlHostnamesDispatcher,
    'crawl-hostnames-dispatch',
  ),
  crawlJob(
    'crawl_tier1_dispatcher',
    '30 2 * * *',
    PRIORITY_DISPATCHER,
    'Dispatch tier-1 hostname crawls (daily)',
    enqueueCrawlTier1Dispatcher,
    'crawl-tier1-dispatch',
  ),
  crawlJob(
    'crawl_tier2_dispatcher',
    '0 3 * * 0',
    PRIORITY_DISPATCHER,
    'Dispatch tier-2 hostname crawls (weekly)',
    enqueueCrawlTier2Dispatcher,
    'crawl-tier2-dispatch',
  ),
  crawlJob(
    'refresh_hostname_crawler_dispatcher',
    '0 4 * * 1',
    PRIORITY_DISPATCHER,
    'Refresh hostname crawler config (weekly)',
    enqueueRefreshHostnameCrawlerDispatcher,
  ),
  crawlJob(
    'crawl_cleanup',
    '30 3 * * *',
    PRIORITY_DEFAULT,
    'Clean up old crawl data (daily)',
    enqueueCrawlCleanup,
  ),
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(crawlHostnamesQueue, scheduledJobManifest)
}

function crawlJob(
  id: CrawlHostnamesJobs,
  pattern: string,
  priority: number,
  description: string,
  trigger: () => unknown,
  backfillId?: string,
) {
  return {
    schedulerId: id,
    registration: 'sequential' as const,
    repeat: { pattern },
    template: {
      name: id,
      data: {},
      opts: { ...DEFAULT_OPTIONS, priority } satisfies JobOptions,
    },
    operatorSurfaces: [
      { kind: 'scheduled-jobs' as const, id, schedule: pattern, description, trigger },
      ...((backfillId ? [{ kind: 'backfill', backfillId: backfillId }] : []) as
        | []
        | [{ kind: 'backfill'; backfillId: string }]),
    ] as const,
  }
}
