import { processBatch } from '@services/bedrock-embeddings-batch/orchestrator/poll'
import {
  getPendingBatches,
  getBatchInfo,
} from '@services/bedrock-embeddings/batch/orchestrator/poll-queries'
import {
  downloadBatchResults,
  cleanupResultsFile,
} from '@services/bedrock-embeddings-batch/orchestrator/results'
import { cleanupBatchLocks } from '@services/bedrock-embeddings-batch/orchestrator/cleanup'
import { runStaleCleanup } from '@services/bedrock-embeddings-batch/orchestrator/stale-cleanup'
import { applyImageBatchUpdates } from '@services/bedrock-embeddings-batch/orchestrator/save-images'
import {
  streamPendingTopics,
  copyExistingTopicEmbeddings,
  applyTopicBatchUpdates,
} from '@services/bedrock-embeddings-batch/entities/topics'
import {
  streamPendingPosts,
  copyExistingPostEmbeddings,
  applyPostBatchUpdates,
} from '@services/bedrock-embeddings-batch/entities/posts'
import {
  streamPendingRssFeedItems,
  copyExistingRssFeedItemEmbeddings,
  applyRssFeedItemBatchUpdates,
} from '@services/bedrock-embeddings-batch/entities/rss-feed-items'
import { streamPendingCrawlChunks } from '@services/bedrock-embeddings-batch/entities/crawl-chunks'
import {
  addImageToBatch,
  streamPendingImages,
} from '@services/bedrock-embeddings-batch/entities/images'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import {
  enqueueBulkProcessEmbeddingBatchPolling,
  enqueueCreateTopicEmbeddingsBatch,
  enqueueCreatePostEmbeddingsBatch,
  enqueueCreateRssFeedItemEmbeddingsBatch,
  enqueueCreateCrawlChunkBatch,
  enqueueCreateImageEmbeddingsBatch,
  enqueueEmbeddingsBatchCreationDispatcher,
} from '@queues/bedrock-embeddings-batch/enqueues'
import {
  type CreateBatchResult,
  processBatchCreation,
  processImageBatchCreation,
} from '@services/bedrock-embeddings-batch/utils'
import {
  processBatchResultsInBatches,
  processCrawlChunkBatchResults,
  processImageBatchResultsInBatches,
} from '@services/bedrock-embeddings-batch/result-processing'
import { getQueueStats } from '@services/queue-monitoring/get-queue-stats'
import { EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME } from '@queues/bedrock-embeddings/config'
import { getBacklogThreshold, getStaleTtlHours } from '@services/bedrock-embeddings/batch/config'

export const processTopicBatchCreation = (): Promise<CreateBatchResult> =>
  processBatchCreation({
    jobType: 'topics',
    streamPending: streamPendingTopics,
    copyExisting: copyExistingTopicEmbeddings,
    reEnqueue: enqueueCreateTopicEmbeddingsBatch,
  })

export const processPostBatchCreation = (): Promise<CreateBatchResult> =>
  processBatchCreation({
    jobType: 'posts',
    streamPending: streamPendingPosts,
    copyExisting: copyExistingPostEmbeddings,
    reEnqueue: enqueueCreatePostEmbeddingsBatch,
  })

export const processRssFeedItemBatchCreation = (): Promise<CreateBatchResult> =>
  processBatchCreation({
    jobType: 'rss_feed_items',
    streamPending: streamPendingRssFeedItems,
    copyExisting: copyExistingRssFeedItemEmbeddings,
    reEnqueue: enqueueCreateRssFeedItemEmbeddingsBatch,
  })

export const processCrawlChunkBatchCreation = (): Promise<CreateBatchResult> =>
  processBatchCreation({
    jobType: 'crawl_chunks',
    streamPending: streamPendingCrawlChunks,
    reEnqueue: enqueueCreateCrawlChunkBatch,
  })

export const processImageEmbeddingBatchCreation = (): Promise<CreateBatchResult> =>
  processImageBatchCreation({
    streamPending: streamPendingImages,
    addImageToBatch,
    reEnqueue: enqueueCreateImageEmbeddingsBatch,
  })

export const processBatchPolling = async (
  batchId: string,
): Promise<{ success: boolean; processed?: boolean; status?: string }> => {
  await processBatch(batchId)

  const batchInfo = await getBatchInfo(batchId)
  if (!batchInfo) {
    throw new Error(`Batch not found: ${batchId}`)
  }

  const batchData = batchInfo.data as { status?: string; outputS3Uri?: string }
  const jobType = batchInfo.job_type as BatchJobType | null

  if (batchData.status !== 'Completed' && batchData.status !== 'PartiallyCompleted') {
    return { success: true, status: batchData.status }
  }

  let resultsFilePath: string | null = null
  try {
    resultsFilePath = await downloadBatchResults(batchId)

    // Process results in batches based on job type
    if (jobType === 'topics') {
      await processBatchResultsInBatches(resultsFilePath, applyTopicBatchUpdates)
    } else if (jobType === 'posts') {
      await processBatchResultsInBatches(resultsFilePath, applyPostBatchUpdates)
    } else if (jobType === 'rss_feed_items') {
      await processBatchResultsInBatches(resultsFilePath, applyRssFeedItemBatchUpdates)
    } else if (jobType === 'crawl_chunks') {
      await processBatchResultsInBatches(resultsFilePath, processCrawlChunkBatchResults)
    } else if (jobType === 'images') {
      await processImageBatchResultsInBatches(resultsFilePath, applyImageBatchUpdates)
    }
  } finally {
    if (resultsFilePath) {
      try {
        await cleanupBatchLocks(batchId)
      } finally {
        await cleanupResultsFile(resultsFilePath)
      }
    }
  }

  return { success: true, processed: true }
}

export const processBatchPollingDispatcher = async () => {
  const pendingBatches = await getPendingBatches()

  if (pendingBatches.length === 0) {
    return { count: 0 }
  }

  await enqueueBulkProcessEmbeddingBatchPolling(pendingBatches.map(batch => batch.id))

  return { count: pendingBatches.length }
}

export const processBatchCreationDispatcher = async () => {
  // Enqueue all batch creation jobs
  await Promise.all([
    enqueueCreateTopicEmbeddingsBatch(),
    enqueueCreatePostEmbeddingsBatch(),
    enqueueCreateRssFeedItemEmbeddingsBatch(),
    enqueueCreateCrawlChunkBatch(),
    enqueueCreateImageEmbeddingsBatch(),
  ])

  return { batchesEnqueued: 5 }
}

export const processBacklogDispatcher = async (): Promise<{
  triggered: boolean
  depth: number
  threshold: number
}> => {
  const stats = await getQueueStats(EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME)
  const depth = stats.waiting + stats.active
  const threshold = getBacklogThreshold()

  if (depth >= threshold) {
    await enqueueEmbeddingsBatchCreationDispatcher()
    return { triggered: true, depth, threshold }
  }

  return { triggered: false, depth, threshold }
}

export const processStaleCleanupDispatcher = () => runStaleCleanup(getStaleTtlHours())
