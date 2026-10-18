import type { JobOptions } from 'glide-mq'
import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import type { CrawlHostnamesJobs } from '../types.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { enqueueBoilerplateRemovalDispatcher } from './boilerplate.mts'
import { PRIORITY_DISPATCHER } from '../config.mts'
import {
  enqueueCrawlCleanup,
  enqueueCrawlHostnamesDispatcher,
  enqueueCrawlTier1Dispatcher,
  enqueueCrawlTier2Dispatcher,
  enqueueRefreshHostnameCrawlerDispatcher,
} from './hostnames.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_CPU_QUEUE_NAME, [
  crawlJob(
    'crawl_hostnames_dispatcher',
    '0 * * * *',
    PRIORITY_DISPATCHER,
    'Dispatch due hostname crawl jobs (hourly)',
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
    PRIORITY_DISPATCHER,
    'Clean up old crawl data (daily)',
    enqueueCrawlCleanup,
  ),
  {
    schedulerId: 'crawl:boilerplate-removal-dispatcher',
    repeat: { pattern: '0 5 * * *' },
    template: {
      name: 'crawl.boilerplate_removal_dispatcher',
      data: {},
      opts: requireBackgroundCpuJob('crawl.boilerplate_removal_dispatcher')
        .options satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'crawl:boilerplate-removal-dispatcher',
        schedule: '0 5 * * *',
        description: 'Dispatch HTML boilerplate removal',
        trigger: enqueueBoilerplateRemovalDispatcher,
      },
    ],
  },
])

function crawlJob(
  id: CrawlHostnamesJobs,
  pattern: string,
  priority: number,
  description: string,
  trigger: () => unknown,
  backfillId?: string,
) {
  return {
    schedulerId: `crawl:${id}`,
    registration: 'sequential' as const,
    repeat: { pattern },
    template: {
      name: `crawl.${id}`,
      data: {},
      opts: { ...requireBackgroundCpuJob(`crawl.${id}`).options, priority } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs' as const,
        id: `crawl:${id}`,
        schedule: pattern,
        description,
        trigger,
      },
      ...((backfillId ? [{ kind: 'backfill', backfillId: backfillId }] : []) as
        | []
        | [{ kind: 'backfill'; backfillId: string }]),
    ] as const,
  }
}
