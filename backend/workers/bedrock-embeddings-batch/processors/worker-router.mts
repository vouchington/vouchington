import type {
  BedrockEmbeddingsBatchCreationJob,
  BedrockEmbeddingsBatchPollingJob,
  BedrockEmbeddingsBatchDispatcherJob,
} from '@queues/bedrock-embeddings-batch/types'
import {
  processTopicBatchCreation,
  processPostBatchCreation,
  processRssFeedItemBatchCreation,
  processCrawlChunkBatchCreation,
  processImageEmbeddingBatchCreation,
  processBatchPolling,
  processBatchPollingDispatcher,
  processBatchCreationDispatcher,
  processBacklogDispatcher,
  processStaleCleanupDispatcher,
} from '../processors.mts'
import { Worker, type Job } from 'glide-mq'
import { handleBedrockRateLimit } from '@modules/queue-errors'

type JobData = Record<string, unknown>

export const processBedrockEmbeddingsBatchJob = async (
  job: Job<JobData>,
  worker: Worker,
): Promise<unknown> => {
  try {
    const orderingKey = job.opts.ordering?.key

    switch (orderingKey) {
      case 'creation': {
        switch (job.name as BedrockEmbeddingsBatchCreationJob) {
          case 'topics':
            return await processTopicBatchCreation()
          case 'posts':
            return await processPostBatchCreation()
          case 'rss_feed_items':
            return await processRssFeedItemBatchCreation()
          case 'crawl_chunks':
            return await processCrawlChunkBatchCreation()
          case 'images':
            return await processImageEmbeddingBatchCreation()
          default:
            throw new Error(`Unknown creation job type: ${job.name}`)
        }
      }
      case 'polling': {
        switch (job.name as BedrockEmbeddingsBatchPollingJob) {
          case 'poll_batch': {
            const batchId = job.data?.batch_id
            if (!batchId) throw new Error('Batch ID is required')
            return await processBatchPolling(batchId as string)
          }
          default:
            throw new Error(`Unknown polling job type: ${job.name}`)
        }
      }
      case 'dispatcher': {
        switch (job.name as BedrockEmbeddingsBatchDispatcherJob) {
          case 'poll_dispatcher':
            return await processBatchPollingDispatcher()
          case 'creation_dispatcher':
            return await processBatchCreationDispatcher()
          case 'backlog_dispatcher':
            return await processBacklogDispatcher()
          case 'stale_cleanup_dispatcher':
            return await processStaleCleanupDispatcher()
          default:
            throw new Error(`Unknown dispatcher job type: ${job.name}`)
        }
      }
      default:
        throw new Error(`Unknown ordering key: ${orderingKey}`)
    }
  } catch (error: unknown) {
    return await handleBedrockRateLimit(error, worker)
  }
}
