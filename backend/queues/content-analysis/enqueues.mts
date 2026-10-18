import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import {
  CONTENT_ANALYSIS_QUEUE_NAME,
  LANGUAGE_DETECTION_DEFAULTS,
  PRIORITY_DEFAULT,
} from './config.mts'
import { contentAnalysisQueue } from './queues.mts'
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

const defaults = {
  attempts: LANGUAGE_DETECTION_DEFAULTS.attempts,
  backoff: LANGUAGE_DETECTION_DEFAULTS.backoff,
  removeOnComplete: LANGUAGE_DETECTION_DEFAULTS.removeOnComplete,
  removeOnFail: LANGUAGE_DETECTION_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

function createLanguageDetectionEnqueue(jobName: LanguageDetectionEntityType) {
  return createEnqueueFunction<LanguageDetectionData, LanguageDetectionEntityType>({
    queue: contentAnalysisQueue,
    queueName: CONTENT_ANALYSIS_QUEUE_NAME,
    jobName,
    defaults,
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
  return createBulkEnqueueFunction<string, LanguageDetectionData, LanguageDetectionEntityType>({
    queue: contentAnalysisQueue,
    queueName: CONTENT_ANALYSIS_QUEUE_NAME,
    jobName,
    defaults,
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
  const enqueue = createEnqueueFunction<Record<string, never>, LanguageDetectionBackfillJobName>({
    queue: contentAnalysisQueue,
    queueName: CONTENT_ANALYSIS_QUEUE_NAME,
    jobName,
    defaults,
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
