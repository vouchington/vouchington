import { createHash } from 'node:crypto'
import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER } from './config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { getBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { ReferralCrawlDispatchData } from './types.mts'

type CrawlReferralLinkEntry = { linkId: string; urlId: string; referralProgramId: string }
type CrawlReferralLinkContext = { hostnameId: string; rateLimitMs: number }

const CRAWL_JOB_NAME = 'crawl.crawl_referral_link'
const DISPATCHER_JOB_NAME = 'crawl.crawl_referral_links_dispatcher'

const enqueueBulkCrawlReferralLinkJobs = createBulkEnqueueFunction<
  CrawlReferralLinkEntry,
  CrawlReferralLinkEntry,
  string,
  CrawlReferralLinkContext
>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: CRAWL_JOB_NAME,
  defaults: getBackgroundCpuJob(CRAWL_JOB_NAME)!.options,
  buildJob: data => ({
    data,
    opts: {
      deduplication: {
        id: `${CRAWL_JOB_NAME}__${data.linkId}`,
        mode: 'debounce' as const,
      },
    },
  }),
})

const enqueueCrawlReferralLinksDispatcherJob = createEnqueueFunction<
  ReferralCrawlDispatchData,
  string
>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: DISPATCHER_JOB_NAME,
  defaults: getBackgroundCpuJob(DISPATCHER_JOB_NAME)!.options,
})

export function enqueueBulkCrawlReferralLinks(
  entries: CrawlReferralLinkEntry[],
  options: { hostnameId: string; rateLimitMs?: number },
): EnqueueReturnType {
  if (entries.length === 0) return Promise.resolve()

  const { hostnameId, rateLimitMs = 1_000 } = options
  return enqueueBulkCrawlReferralLinkJobs(
    entries,
    {
      priority: PRIORITY_DEFAULT,
      ordering: {
        key: `crawl:${hostnameId}`,
        concurrency: 1,
        rateLimit: { max: 1, duration: rateLimitMs },
      },
    } satisfies Partial<JobOptions>,
    { hostnameId, rateLimitMs },
  )
}

export function enqueueCrawlReferralLinksDispatcher(
  data: ReferralCrawlDispatchData = {},
): EnqueueReturnType {
  return enqueueCrawlReferralLinksDispatcherJob(data, {
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      // Event windows are distinct requests; periodic roots share the single scheduled sweep.
      id: `referral-crawl:${createHash('sha256')
        .update(
          JSON.stringify({
            urlId: data.urlId,
            referralLinkIds: data.referralLinkIds,
            ...(data.urlId && { eventWindow: data.cursor?.sweepStartedAt }),
          }),
        )
        .digest('hex')}`,
      mode: 'simple',
    },
  })
}
