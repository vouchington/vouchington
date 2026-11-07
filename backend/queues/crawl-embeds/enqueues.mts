import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  BACKFILL_DEDUPLICATION_TTL_MS,
  CRAWL_EMBEDS_DEFAULTS,
  CRAWL_EMBEDS_QUEUE_NAME,
  OEMBED_HOST_RATE_LIMIT_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
} from './config.mts'
import { crawlEmbedsQueue } from './queues.mts'
import type { CrawlEmbedEntry, CrawlEmbedsJobPayloads, EnqueueCrawlEmbedOptions } from './types.mts'

const JOB_NAME = 'resolve_crawl_oembed' satisfies keyof CrawlEmbedsJobPayloads
const BACKFILL_JOB_NAME = 'backfill_crawl_embeds' satisfies keyof CrawlEmbedsJobPayloads

const defaults = {
  attempts: CRAWL_EMBEDS_DEFAULTS.attempts,
  backoff: CRAWL_EMBEDS_DEFAULTS.backoff,
  removeOnComplete: CRAWL_EMBEDS_DEFAULTS.removeOnComplete,
  removeOnFail: CRAWL_EMBEDS_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

function createCrawlEmbedsEnqueueFunction<TName extends keyof CrawlEmbedsJobPayloads>(
  jobName: TName,
) {
  return createEnqueueFunction<CrawlEmbedsJobPayloads[TName], TName>({
    queue: crawlEmbedsQueue,
    queueName: CRAWL_EMBEDS_QUEUE_NAME,
    jobName,
    defaults,
  })
}

const enqueueCrawlEmbedJob = createCrawlEmbedsEnqueueFunction(JOB_NAME)

const enqueueBulkCrawlEmbedJobs = createBulkEnqueueFunction({
  queue: crawlEmbedsQueue,
  queueName: CRAWL_EMBEDS_QUEUE_NAME,
  jobName: JOB_NAME,
  defaults,
  buildJob: (entry: CrawlEmbedEntry) => ({
    data: { crawl_id: entry.crawlId } satisfies CrawlEmbedsJobPayloads[typeof JOB_NAME],
    opts: crawlEmbedJobOptions(entry.crawlId, entry.endpointHostname),
  }),
})

const enqueueBackfillCrawlEmbedsJob = createCrawlEmbedsEnqueueFunction(BACKFILL_JOB_NAME)

/**
 * The endpoint hostname configures queue ordering only. The job itself carries
 * one durable crawl ID and re-reads the endpoint from that crawl at execution.
 */
export function enqueueCrawlEmbed(
  crawlId: string,
  { endpointHostname, priority = PRIORITY_DEFAULT }: EnqueueCrawlEmbedOptions,
): EnqueueReturnType {
  return enqueueCrawlEmbedJob(
    { crawl_id: crawlId },
    crawlEmbedJobOptions(crawlId, endpointHostname, priority),
  )
}

export function enqueueBulkCrawlEmbeds(entries: CrawlEmbedEntry[], priority = PRIORITY_DEFAULT) {
  return enqueueBulkCrawlEmbedJobs(entries, { priority })
}

export function enqueueBackfillCrawlEmbeds(options?: {
  deduplicationId?: string
}): EnqueueReturnType {
  return enqueueBackfillCrawlEmbedsJob({}, {
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: options?.deduplicationId ?? BACKFILL_JOB_NAME,
      mode: 'throttle' as const,
      ttl: BACKFILL_DEDUPLICATION_TTL_MS,
    },
    ordering: { key: 'backfill', concurrency: 1 },
  } satisfies Partial<JobOptions>)
}

function crawlEmbedJobOptions(
  crawlId: string,
  endpointHostname: string,
  priority = PRIORITY_DEFAULT,
): Partial<JobOptions> {
  return {
    priority,
    deduplication: {
      id: `resolve_crawl_oembed__${crawlId}`,
      mode: 'simple' as const,
    },
    ordering: {
      key: `oembed:${endpointHostname}`,
      rateLimit: { max: 1, duration: OEMBED_HOST_RATE_LIMIT_MS },
    },
  }
}
