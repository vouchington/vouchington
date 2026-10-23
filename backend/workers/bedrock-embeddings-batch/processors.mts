import type { BatchListingCursor } from '@services/bedrock-embeddings/batch/orchestrator/listing-page'
import type { StaleBatchCursor } from '@services/bedrock-embeddings-batch/orchestrator/find-stale'
import { processBatch } from '@services/bedrock-embeddings-batch/orchestrator/poll'
import {
  getBatchInfo,
  getPendingBatches,
} from '@services/bedrock-embeddings/batch/orchestrator/poll-queries'
import {
  downloadBatchResults,
  cleanupResultsFile,
} from '@services/bedrock-embeddings-batch/orchestrator/results'
import { cleanupBatchLocks } from '@services/bedrock-embeddings-batch/orchestrator/cleanup'
import { runStaleCleanup } from '@services/bedrock-embeddings-batch/orchestrator/stale-cleanup'
import { applyImageBatchUpdates } from '@services/bedrock-embeddings-batch/orchestrator/save-images'
import { applyTopicBatchUpdates } from '@services/bedrock-embeddings-batch/entities/topics'
import { applyPostBatchUpdates } from '@services/bedrock-embeddings-batch/entities/posts'
import { applyRssFeedItemBatchUpdates } from '@services/bedrock-embeddings-batch/entities/rss-feed-items'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import {
  enqueueBulkProcessEmbeddingBatchPolling,
  enqueueEmbeddingsBatchPollDispatcher,
  enqueueEmbeddingsBatchStaleCleanupDispatcher,
  enqueueCreateTopicEmbeddingsBatch,
  enqueueCreatePostEmbeddingsBatch,
  enqueueCreateRssFeedItemEmbeddingsBatch,
  enqueueCreateCrawlChunkBatch,
  enqueueCreateImageEmbeddingsBatch,
  enqueueEmbeddingsBatchCreationDispatcher,
} from '@queues/bedrock-embeddings-batch/enqueues'
import {
  processBatchResultsInBatches,
  processCrawlChunkBatchResults,
  processImageBatchResultsInBatches,
} from '@services/bedrock-embeddings-batch/result-processing'
import { getSingleEmbeddingBacklogSnapshot } from '@queues/bedrock-embeddings/enqueues/single-backlog'
import { getBacklogThreshold, getStaleTtlHours } from '@services/bedrock-embeddings/batch/config'

export {
  processExistingEmbeddingReconciliation,
  processPostEmbeddingTriggerRecovery,
} from './processors/reconciliation.mts'

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

export const processBatchPollingDispatcher = async (cursor?: BatchListingCursor) => {
  const page = await getPendingBatches(cursor)
  if (page.batches.length > 0)
    await enqueueBulkProcessEmbeddingBatchPolling(page.batches.map(batch => batch.id))
  if (page.nextCursor) await enqueueEmbeddingsBatchPollDispatcher({ cursor: page.nextCursor })
  return { count: page.batches.length, hasMore: page.hasMore }
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
  const { depth } = await getSingleEmbeddingBacklogSnapshot()
  const threshold = getBacklogThreshold()

  if (depth >= threshold) {
    await enqueueEmbeddingsBatchCreationDispatcher()
    return { triggered: true, depth, threshold }
  }

  return { triggered: false, depth, threshold }
}

export const processStaleCleanupDispatcher = async (cursor?: StaleBatchCursor) => {
  const result = await runStaleCleanup(getStaleTtlHours(), cursor)
  if (result.nextCursor)
    await enqueueEmbeddingsBatchStaleCleanupDispatcher({ cursor: result.nextCursor })
  return result
}
