import { ingestBatchResults } from '@services/embeddings-batch/orchestrator/ingestion'
import type { BatchListingCursor } from '@services/embeddings/batch/orchestrator/listing-page'
import { completeBatchIngestion, processBatch } from '@services/embeddings-batch/orchestrator/poll'
import {
  getBatchInfo,
  getPendingBatches,
} from '@services/embeddings/batch/orchestrator/poll-queries'
import { streamBatchResults } from '@services/embeddings-batch/orchestrator/results'
import { getBatchResultSource } from '@services/embeddings-batch/orchestrator/result-source'
import { runStaleCleanup } from '@services/embeddings-batch/orchestrator/stale-cleanup'
import { applyImageBatchUpdates } from '@services/embeddings-batch/orchestrator/save-images'
import { applyTopicBatchUpdates } from '@services/embeddings-batch/entities/topics'
import { applyPostBatchUpdates } from '@services/embeddings-batch/entities/posts'
import { applyRssFeedItemBatchUpdates } from '@services/embeddings-batch/entities/rss-feed-items'
import type { BatchJobType } from '@services/embeddings/batch/types'
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
} from '@queues/gemini-embeddings-batch/enqueues'
import {
  processBatchResultsInBatches,
  processCrawlChunkBatchResults,
  processImageBatchResultsInBatches,
} from '@services/embeddings-batch/result-processing'
import { getSingleEmbeddingBacklogSnapshot } from '@queues/gemini-embeddings/enqueues/single-backlog'
import { getBacklogThreshold, getStaleTtlHours } from '@services/embeddings/batch/config'
import { loadBatchManifest, validateBatchOutput } from '@services/embeddings-batch/result-manifest'

export {
  processExistingEmbeddingReconciliation,
  processPostEmbeddingTriggerRecovery,
} from './processors/reconciliation.mts'

export const processBatchPolling = async (
  batchId: string,
  finalAttempt = false,
): Promise<{ success: boolean; processed?: boolean; status?: string }> => {
  await processBatch(batchId)

  const batchInfo = await getBatchInfo(batchId)
  if (!batchInfo) {
    throw new Error(`Batch not found: ${batchId}`)
  }

  const batchData = batchInfo.data as { state?: string; outputGcsUri?: string }
  const jobType = batchInfo.job_type as BatchJobType | null

  if (
    batchData.state !== 'JOB_STATE_SUCCEEDED' &&
    batchData.state !== 'JOB_STATE_PARTIALLY_SUCCEEDED'
  ) {
    return { success: true, status: batchData.state }
  }

  if (batchInfo.completed_at || batchInfo.failed_at || batchInfo.cancelled_at)
    return { success: true, processed: true }

  await ingestBatchResults(
    batchId,
    async () => {
      const [manifestResult, sourceResult] = await Promise.allSettled([
        loadBatchManifest(batchId),
        getBatchResultSource(batchId),
      ])
      // Settle both owned reads before retrying or releasing this delivery's HTTP scope.
      if (manifestResult.status === 'rejected') throw manifestResult.reason
      if (sourceResult.status === 'rejected') throw sourceResult.reason
      const manifest = manifestResult.value
      const source = sourceResult.value
      await validateBatchOutput(streamBatchResults(source), manifest)

      // Process results in batches based on job type
      if (jobType === 'topics') {
        await processBatchResultsInBatches(
          streamBatchResults(source),
          updates => applyTopicBatchUpdates(updates),
          1000,
          'topics',
          manifest,
        )
      } else if (jobType === 'posts') {
        await processBatchResultsInBatches(
          streamBatchResults(source),
          updates => applyPostBatchUpdates(updates),
          1000,
          'posts',
          manifest,
        )
      } else if (jobType === 'rss_feed_items') {
        await processBatchResultsInBatches(
          streamBatchResults(source),
          updates => applyRssFeedItemBatchUpdates(updates),
          1000,
          'rss_feed_items',
          manifest,
        )
      } else if (jobType === 'crawl_chunks') {
        await processBatchResultsInBatches(
          streamBatchResults(source),
          updates => processCrawlChunkBatchResults(updates),
          1000,
          'crawl_chunks',
          manifest,
        )
      } else if (jobType === 'images') {
        await processImageBatchResultsInBatches(
          streamBatchResults(source),
          updates => applyImageBatchUpdates(updates),
          1000,
          manifest,
        )
      } else throw new Error(`Unsupported embedding batch entity type: ${String(jobType)}`)
      await completeBatchIngestion(batchId)
    },
    finalAttempt,
  )

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

export const processStaleCleanupDispatcher = async (cursor?: BatchListingCursor) => {
  const result = await runStaleCleanup(getStaleTtlHours(), cursor)
  if (result.nextCursor)
    await enqueueEmbeddingsBatchStaleCleanupDispatcher({ cursor: result.nextCursor })
  return result
}
