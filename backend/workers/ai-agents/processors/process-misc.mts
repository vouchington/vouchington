import type { Job } from 'glide-mq'
import type { CustomerSupportJobData, StoryClusteringJobData } from '@queues/ai-agents/types'
import { generateSupportResponse } from '@agents/customer-support'
import { clusterRssFeedItem } from '@services/stories/cluster'
import { hasRssFeedItemEmbedding } from '@services/bedrock-embeddings'
import { enqueueStoryClustering } from '@queues/ai-agents/enqueues/story-clustering'

const MAX_EMBEDDING_RETRIES = 10

type ProcessMiscDeps = {
  generateSupportResponse: typeof generateSupportResponse
  clusterRssFeedItem: typeof clusterRssFeedItem
  hasRssFeedItemEmbedding: typeof hasRssFeedItemEmbedding
  enqueueStoryClustering: typeof enqueueStoryClustering
}

const defaultDeps: ProcessMiscDeps = {
  generateSupportResponse,
  clusterRssFeedItem,
  hasRssFeedItemEmbedding,
  enqueueStoryClustering,
}

export async function processCustomerSupport(
  job: Job<CustomerSupportJobData>,
  deps: ProcessMiscDeps = defaultDeps,
): Promise<unknown> {
  if (job.data.idempotencyKey) {
    await deps.generateSupportResponse(job.data.threadId, {
      idempotencyKey: job.data.idempotencyKey,
      supportMessageId: job.data.supportMessageId,
      reclaimLiveLease: job.attemptsMade > 0,
    })
  } else {
    await deps.generateSupportResponse(job.data.threadId)
  }
  return { success: true }
}

export async function processStoryClustering(
  job: Job<StoryClusteringJobData>,
  deps: ProcessMiscDeps = defaultDeps,
): Promise<unknown> {
  const result = await deps.clusterRssFeedItem(job.data.rss_feed_item_id)
  if (result !== null) return result

  const retries = job.data.embedding_retries ?? 0
  if (retries >= MAX_EMBEDDING_RETRIES) return null
  const hasEmbedding = await deps.hasRssFeedItemEmbedding(job.data.rss_feed_item_id)
  if (hasEmbedding) return null

  await deps.enqueueStoryClustering(job.data.rss_feed_item_id, undefined, retries + 1)
  return null
}
