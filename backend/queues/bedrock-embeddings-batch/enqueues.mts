import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  BEDROCK_EMBEDDINGS_BATCH_DEFAULTS,
  BEDROCK_EMBEDDINGS_BATCH_ORDERING,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from './config.mts'
import { bedrock_embeddings_batch } from './queues.mts'
import type {
  BedrockEmbeddingsBatchDispatcherJob,
  BedrockEmbeddingsBatchPollingJob,
} from './types.mts'

type CreationJobName = 'topics' | 'posts' | 'rss_feed_items' | 'crawl_chunks' | 'images'
type DispatcherOptions = {
  deduplicationId?: string
}
const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000

const defaults = {
  attempts: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.attempts,
  backoff: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.backoff,
  removeOnComplete: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.removeOnComplete,
  removeOnFail: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

function createCreationBatchEnqueue(jobName: CreationJobName, deduplicationId: string) {
  const enqueue = createEnqueueFunction<Record<string, never>, CreationJobName>({
    queue: bedrock_embeddings_batch,
    queueName: QUEUE_NAME,
    jobName,
    defaults,
  })

  return (priority?: number): EnqueueReturnType => {
    return enqueue({}, {
      priority: priority ?? PRIORITY_DEFAULT,
      deduplication: {
        id: deduplicationId,
        mode: 'throttle',
        ttl: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.deduplicationTtlMs,
      },
      ordering: BEDROCK_EMBEDDINGS_BATCH_ORDERING.creation,
    } satisfies Partial<JobOptions>)
  }
}

const enqueueBulkProcessEmbeddingBatchPollingJobs = createBulkEnqueueFunction<
  string,
  { batch_id: string },
  BedrockEmbeddingsBatchPollingJob
>({
  queue: bedrock_embeddings_batch,
  queueName: QUEUE_NAME,
  jobName: 'poll_batch',
  defaults,
  buildJob: batchId => ({
    data: { batch_id: batchId },
    opts: {
      deduplication: {
        id: `bedrock_embeddings_batch_polling_${batchId}`,
        mode: 'throttle',
        ttl: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.deduplicationTtlMs,
      },
      ordering: BEDROCK_EMBEDDINGS_BATCH_ORDERING.polling,
    },
  }),
})

function createDispatcherEnqueue(jobName: BedrockEmbeddingsBatchDispatcherJob) {
  const enqueue = createEnqueueFunction<Record<string, never>, BedrockEmbeddingsBatchDispatcherJob>(
    {
      queue: bedrock_embeddings_batch,
      queueName: QUEUE_NAME,
      jobName,
      defaults,
    },
  )

  return (options?: DispatcherOptions): EnqueueReturnType => {
    return enqueue(
      {},
      {
        priority: PRIORITY_DISPATCHER,
        ordering: BEDROCK_EMBEDDINGS_BATCH_ORDERING.dispatcher,
        ...(options?.deduplicationId && {
          deduplication: {
            id: options.deduplicationId,
            mode: 'throttle' as const,
            ttl: BACKFILL_DEDUPLICATION_TTL_MS,
          },
        }),
      },
    )
  }
}

export const enqueueCreateTopicEmbeddingsBatch = createCreationBatchEnqueue(
  'topics',
  'topics_batch',
)
export const enqueueCreatePostEmbeddingsBatch = createCreationBatchEnqueue('posts', 'posts_batch')
export const enqueueCreateRssFeedItemEmbeddingsBatch = createCreationBatchEnqueue(
  'rss_feed_items',
  'rss_feed_items_batch',
)
export const enqueueCreateCrawlChunkBatch = createCreationBatchEnqueue(
  'crawl_chunks',
  'crawl_chunks_batch',
)
export const enqueueCreateImageEmbeddingsBatch = createCreationBatchEnqueue(
  'images',
  'images_batch',
)

export const enqueueBulkProcessEmbeddingBatchPolling = (
  batchIds: string[],
  priority?: number,
): EnqueueReturnType => {
  return enqueueBulkProcessEmbeddingBatchPollingJobs(batchIds, {
    priority: priority ?? PRIORITY_DEFAULT,
  })
}

export const enqueueEmbeddingsBatchPollDispatcher = createDispatcherEnqueue('poll_dispatcher')
export const enqueueEmbeddingsBatchCreationDispatcher =
  createDispatcherEnqueue('creation_dispatcher')
export const enqueueEmbeddingsBatchBacklogDispatcher = createDispatcherEnqueue('backlog_dispatcher')
export const enqueueEmbeddingsBatchStaleCleanupDispatcher = createDispatcherEnqueue(
  'stale_cleanup_dispatcher',
)
