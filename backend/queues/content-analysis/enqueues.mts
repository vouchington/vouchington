import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT } from './config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { LanguageDetectionBackfillJobName, LanguageDetectionEntityType } from './types.mts'

const ONE_HOUR_MS = 3_600_000

type LanguageDetectionData = { id: string }

function makeJobOpts(
  entityType: LanguageDetectionEntityType,
  id: string,
  priority: number,
): Partial<JobOptions> {
  return {
    priority,
    deduplication: {
      id: `content-analysis:language:${entityType}:${id}`,
      mode: 'debounce' as const,
    },
  }
}

function createLanguageDetectionEnqueue(jobName: LanguageDetectionEntityType) {
  const job = requireBackgroundCpuJob(`content-analysis.${jobName}`)
  return createEnqueueFunction<LanguageDetectionData, string>({
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
  })
}

type LanguageDetectionEnqueueResult = ReturnType<ReturnType<typeof createLanguageDetectionEnqueue>>

const enqueueLanguageDetectionJobs = {
  post: createLanguageDetectionEnqueue('post'),
  rss_feed_item: createLanguageDetectionEnqueue('rss_feed_item'),
  crawl: createLanguageDetectionEnqueue('crawl'),
  community: createLanguageDetectionEnqueue('community'),
  user: createLanguageDetectionEnqueue('user'),
  topic: createLanguageDetectionEnqueue('topic'),
} satisfies Record<LanguageDetectionEntityType, ReturnType<typeof createLanguageDetectionEnqueue>>

function createBulkLanguageDetectionEnqueue(jobName: LanguageDetectionEntityType) {
  const job = requireBackgroundCpuJob(`content-analysis.${jobName}`)
  return createBulkEnqueueFunction<string, LanguageDetectionData, string>({
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
    buildJob: id => ({ data: { id }, opts: makeJobOpts(jobName, id, PRIORITY_DEFAULT) }),
  })
}

const enqueueBulkLanguageDetectionJobs = {
  post: createBulkLanguageDetectionEnqueue('post'),
  rss_feed_item: createBulkLanguageDetectionEnqueue('rss_feed_item'),
  crawl: createBulkLanguageDetectionEnqueue('crawl'),
  community: createBulkLanguageDetectionEnqueue('community'),
  user: createBulkLanguageDetectionEnqueue('user'),
  topic: createBulkLanguageDetectionEnqueue('topic'),
} satisfies Record<
  LanguageDetectionEntityType,
  ReturnType<typeof createBulkLanguageDetectionEnqueue>
>

export function enqueueLanguageDetection(
  entityType: LanguageDetectionEntityType,
  id: string,
  priority?: number,
): LanguageDetectionEnqueueResult {
  return enqueueLanguageDetectionJobs[entityType](
    { id },
    makeJobOpts(entityType, id, priority ?? PRIORITY_DEFAULT),
  )
}

export function enqueueBulkLanguageDetection(
  entityType: LanguageDetectionEntityType,
  ids: string[],
  priority?: number,
) {
  return enqueueBulkLanguageDetectionJobs[entityType](ids, {
    priority: priority ?? PRIORITY_DEFAULT,
  })
}

// Backfill dispatcher enqueue functions (throttle, 1h TTL, priority 100)
function makeBackfillEnqueue(jobName: LanguageDetectionBackfillJobName) {
  const job = requireBackgroundCpuJob(`content-analysis.${jobName}`)
  const enqueue = createEnqueueFunction<Record<string, never>, string>({
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
  })
  return () =>
    enqueue(
      {},
      {
        priority: 100,
        deduplication: {
          id: `content-analysis:language:${jobName}`,
          mode: 'throttle',
          ttl: ONE_HOUR_MS,
        },
      },
    )
}

export const enqueueBackfillLanguageDetectionPosts = makeBackfillEnqueue('backfill_posts')
export const enqueueBackfillLanguageDetectionRssFeedItems =
  makeBackfillEnqueue('backfill_rss_feed_items')
export const enqueueBackfillLanguageDetectionCrawls = makeBackfillEnqueue('backfill_crawls')
export const enqueueBackfillLanguageDetectionCommunities =
  makeBackfillEnqueue('backfill_communities')
export const enqueueBackfillLanguageDetectionUsers = makeBackfillEnqueue('backfill_users')
export const enqueueBackfillLanguageDetectionTopics = makeBackfillEnqueue('backfill_topics')
