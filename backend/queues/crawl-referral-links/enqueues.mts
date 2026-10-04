import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  CRAWL_REFERRAL_LINKS_DEFAULTS,
  CRAWL_REFERRAL_LINKS_ORDERING,
  CRAWL_REFERRAL_LINKS_QUEUE_NAME,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
} from './config.mts'
import { crawlReferralLinksQueue } from './queues.mts'
import type { CrawlReferralLinksJobs, ReferralCrawlDispatchData } from './types.mts'

type CrawlReferralLinkEntry = { linkId: string; urlId: string; referralProgramId: string }
type CrawlReferralLinkContext = { hostnameId: string; rateLimitMs: number }

const CRAWL_JOB_NAME: CrawlReferralLinksJobs = 'crawl_referral_link'
const DISPATCHER_JOB_NAME: CrawlReferralLinksJobs = 'crawl_referral_links_dispatcher'

const defaults = {
  attempts: CRAWL_REFERRAL_LINKS_DEFAULTS.attempts,
  backoff: CRAWL_REFERRAL_LINKS_DEFAULTS.backoff,
  removeOnComplete: CRAWL_REFERRAL_LINKS_DEFAULTS.removeOnComplete,
  removeOnFail: CRAWL_REFERRAL_LINKS_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

const enqueueBulkCrawlReferralLinkJobs = createBulkEnqueueFunction<
  CrawlReferralLinkEntry,
  CrawlReferralLinkEntry,
  CrawlReferralLinksJobs,
  CrawlReferralLinkContext
>({
  queue: crawlReferralLinksQueue,
  queueName: CRAWL_REFERRAL_LINKS_QUEUE_NAME,
  jobName: CRAWL_JOB_NAME,
  defaults,
  buildJob: data => ({
    data,
    opts: {
      deduplication: {
        id: `crawl_referral_link__${data.linkId}`,
        mode: 'debounce' as const,
        ttl: CRAWL_REFERRAL_LINKS_DEFAULTS.deduplicationTtlMs,
      },
    },
  }),
})

const enqueueCrawlReferralLinksDispatcherJob = createEnqueueFunction<
  ReferralCrawlDispatchData,
  CrawlReferralLinksJobs
>({
  queue: crawlReferralLinksQueue,
  queueName: CRAWL_REFERRAL_LINKS_QUEUE_NAME,
  jobName: DISPATCHER_JOB_NAME,
  defaults,
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
        key: hostnameId,
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
    ...(data.cursor
      ? {
          deduplication: {
            id: `referral-crawl:${data.urlId ?? 'scheduled'}:${JSON.stringify(data.referralLinkIds ?? [])}:${data.cursor.sweepStartedAt}:${data.cursor.afterWork?.dueAt}:${data.cursor.afterWork?.id}:${data.cursor.afterId}`,
            mode: 'throttle' as const,
            ttl: CRAWL_REFERRAL_LINKS_DEFAULTS.deduplicationTtlMs,
          },
        }
      : {}),
    ordering: CRAWL_REFERRAL_LINKS_ORDERING.dispatcher,
  })
}
