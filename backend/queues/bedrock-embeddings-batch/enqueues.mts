import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  BEDROCK_EMBEDDINGS_BATCH_DEFAULTS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
} from './config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { BedrockEmbeddingsBatchDispatcherJob } from './types.mts'

type CreationJobName = 'topics' | 'posts' | 'rss_feed_items' | 'crawl_chunks' | 'images'
type DispatcherOptions = {
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
  const job = requireBackgroundCpuJob(`bedrock-embeddings.create_${jobName}`)
  const enqueue = createEnqueueFunction<Record<string, never>, string>({
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
  })

  return (priority?: number): EnqueueReturnType =>
    enqueue({}, creationJobOptions(deduplicationId, priority))
}

export function creationJobOptions(
  deduplicationId: string,
  priority?: number,
): Partial<JobOptions> {
  return {
    priority: priority ?? PRIORITY_DEFAULT,
    deduplication: { id: `bedrock-embeddings:creation:${deduplicationId}`, mode: 'simple' },
  }
}

const enqueueBulkProcessEmbeddingBatchPollingJobs = createBulkEnqueueFunction({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'bedrock-embeddings.poll_batch',
  defaults: requireBackgroundCpuJob('bedrock-embeddings.poll_batch').options,
  buildJob: (batchId: string) => ({
    data: { batch_id: batchId },
    opts: {
      deduplication: {
        id: `bedrock-embeddings:batch-polling:${batchId}`,
        mode: 'throttle',
        ttl: BEDROCK_EMBEDDINGS_BATCH_DEFAULTS.deduplicationTtlMs,
      },
    },
  }),
})

function createDispatcherEnqueue(jobName: BedrockEmbeddingsBatchDispatcherJob) {
  const job = requireBackgroundCpuJob(`bedrock-embeddings.${jobName}`)
  const enqueue = createEnqueueFunction<Record<string, never>, string>({
    queue: backgroundCpu,
    queueName: BACKGROUND_CPU_QUEUE_NAME,
    jobName: job.name,
    defaults: job.options,
  })

  return (options?: DispatcherOptions): EnqueueReturnType => {
    return enqueue(
      {},
      {
        priority: PRIORITY_DISPATCHER,
        ...(options?.deduplicationId && {
          deduplication: {
            id: `bedrock-embeddings:${jobName}:${options.deduplicationId}`,
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
