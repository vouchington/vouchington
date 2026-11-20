import type { Job } from 'glide-mq'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import { withBedrockRateLimit } from './bedrock-rate.mts'

const SINGLE_NAMES = new Set([
  'bedrock-embeddings.topic',
  'bedrock-embeddings.post',
  'bedrock-embeddings.rss_feed_item',
])
const CREATION_TYPES = new Map<string, BatchJobType>([
  ['bedrock-embeddings.create_topics', 'topics'],
  ['bedrock-embeddings.create_posts', 'posts'],
  ['bedrock-embeddings.create_rss_feed_items', 'rss_feed_items'],
  ['bedrock-embeddings.create_crawl_chunks', 'crawl_chunks'],
  ['bedrock-embeddings.create_images', 'images'],
])
const BATCH_NAMES = new Set([
  'bedrock-embeddings.poll_batch',
  'bedrock-embeddings.poll_dispatcher',
  'bedrock-embeddings.creation_dispatcher',
  'bedrock-embeddings.backlog_dispatcher',
  'bedrock-embeddings.stale_cleanup_dispatcher',
  'bedrock-embeddings.reconcile_existing',
  'bedrock-embeddings.post_trigger_recovery',
])

export function isRetainedBedrockJob(name: string): boolean {
  return SINGLE_NAMES.has(name) || CREATION_TYPES.has(name) || BATCH_NAMES.has(name)
}

export async function processRetainedBedrockJob(job: Job<unknown>): Promise<unknown> {
  return withBedrockRateLimit(async () => {
    if (SINGLE_NAMES.has(job.name)) {
      const { processBedrockNovaMultimodalV1SingleJob } =
        await import('@workers/bedrock-embeddings/processors/nova-multimodal-v1-single')
      return processBedrockNovaMultimodalV1SingleJob(
        job as Job<{ id?: string; rss_feed_item_id?: string }>,
      )
    }
    const creationType = CREATION_TYPES.get(job.name)
    if (creationType) {
      const { processEmbeddingCreationJob } =
        await import('@workers/bedrock-embeddings-batch/processors/creation')
      return processEmbeddingCreationJob(job, creationType)
    }
    if (BATCH_NAMES.has(job.name)) {
      const { processBedrockEmbeddingsBatchJob } =
        await import('@workers/bedrock-embeddings-batch/processors/worker-router')
      return processBedrockEmbeddingsBatchJob(job)
    }
    throw new Error(`Unknown retained Bedrock job: ${job.name}`)
  })
}
