import { parseEmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/payload/job-payload'
import type { EmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/types'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import {
  processBatchCreation,
  processImageBatchCreation,
} from '@services/bedrock-embeddings-batch/utils'
import { streamPendingTopics } from '@services/bedrock-embeddings-batch/entities/topics'
import { streamPendingPosts } from '@services/bedrock-embeddings-batch/entities/posts'
import { streamPendingRssFeedItems } from '@services/bedrock-embeddings-batch/entities/rss-feed-items'
import { streamPendingCrawlChunks } from '@services/bedrock-embeddings-batch/entities/crawl-chunks'
import {
  streamPendingImages,
  addImageToBatch,
} from '@services/bedrock-embeddings-batch/entities/images'

import {
  delayEmbeddingCreationJob,
  type EmbeddingCreationJob,
} from '@queues/bedrock-embeddings-batch/payload/creation-deferral'

const textStreams = {
  topics: streamPendingTopics,
  posts: streamPendingPosts,
  rss_feed_items: streamPendingRssFeedItems,
  crawl_chunks: streamPendingCrawlChunks,
}

export function processEmbeddingCreationJob(job: EmbeddingCreationJob, jobType: BatchJobType) {
  const cursor = parseEmbeddingScanCursor(job.data)
  const reEnqueue = (next?: EmbeddingScanCursor, delayMs?: number) =>
    delayEmbeddingCreationJob(job, next, delayMs)
  if (jobType === 'images')
    return processImageBatchCreation({
      cursor,
      reEnqueue,
      streamPending: options => streamPendingImages({ ...options, cursor }),
      addImageToBatch,
    })
  return processBatchCreation({
    cursor,
    reEnqueue,
    jobType,
    streamPending: options => textStreams[jobType]({ ...options, cursor }),
  })
}
