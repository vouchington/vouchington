import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  GEMINI_EMBEDDINGS_BATCH_DEFAULTS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
} from './config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { createBackgroundCpuEnqueueFunction } from '@queues/background-cpu/enqueues/typed-job'
import type { BackgroundCpuJobPayloads } from '@queues/background-cpu/types'
import type { EmbeddingsBatchDispatcherJob } from './types.mts'

type CreationJobName = 'topics' | 'posts' | 'rss_feed_items' | 'crawl_chunks' | 'images'
type DispatcherOptions = {
  cursor?: { afterId: string; throughId: string }
  deduplicationId?: string
}
const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000

export {
  reconciliationJobOptions,
  enqueueReconcileExistingEmbeddings,
  enqueuePostEmbeddingTriggerRecovery,
  enqueueAllEmbeddingReconciliationRoots,
} from './enqueues/reconciliation.mts'

function createCreationBatchEnqueue(jobName: CreationJobName, deduplicationId: string) {
  const enqueue = createBackgroundCpuEnqueueFunction(`gemini-embeddings.create_${jobName}`)

  return (priority?: number): EnqueueReturnType =>
    enqueue({}, creationJobOptions(deduplicationId, priority))
}

export function creationJobOptions(
  deduplicationId: string,
  priority?: number,
): Partial<JobOptions> {
  return {
    priority: priority ?? PRIORITY_DEFAULT,
    deduplication: { id: `gemini-embeddings:creation:${deduplicationId}`, mode: 'simple' },
  }
}

const POLL_BATCH_JOB_NAME = 'gemini-embeddings.poll_batch'
const enqueueBulkProcessEmbeddingBatchPollingJobs = createBulkEnqueueFunction({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: POLL_BATCH_JOB_NAME,
  defaults: requireBackgroundCpuJob(POLL_BATCH_JOB_NAME).options,
  buildJob: (batchId: string) => ({
    data: { batch_id: batchId } satisfies BackgroundCpuJobPayloads[typeof POLL_BATCH_JOB_NAME],
    opts: {
      deduplication: {
        id: `gemini-embeddings:batch-polling:${batchId}`,
        mode: 'throttle',
        ttl: GEMINI_EMBEDDINGS_BATCH_DEFAULTS.deduplicationTtlMs,
      },
    },
  }),
})

function createDispatcherEnqueue(jobName: EmbeddingsBatchDispatcherJob) {
  const enqueue = createBackgroundCpuEnqueueFunction(`gemini-embeddings.${jobName}`)

  return (options?: DispatcherOptions): EnqueueReturnType => {
    return enqueue(options?.cursor ? { cursor: options.cursor } : {}, {
      priority: PRIORITY_DISPATCHER,
      ...(options?.cursor && {
        jobId: `gemini-embeddings__${jobName}__${options.cursor.throughId}__${options.cursor.afterId}`,
        removeOnComplete: true,
        removeOnFail: true,
      }),
      ...(options?.deduplicationId && {
        deduplication: {
          id: `gemini-embeddings:${jobName}:${options.deduplicationId}`,
          mode: 'throttle' as const,
          ttl: BACKFILL_DEDUPLICATION_TTL_MS,
        },
      }),
    })
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
