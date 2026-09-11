import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import {
  BEDROCK_EMBEDDINGS_DEFAULTS,
  EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
  PRIORITY_DEFAULT,
} from './config.mts'
import { bedrock_embeddings_nova_multimodal_v1_single } from './queues.mts'
import type { DefaultBedrockEmbeddingsJobData } from './types.mts'
import { getQueueStatsCached } from '@services/queue-monitoring/get-queue-stats-cached'
import { trackAIEmbeddingShortCircuit } from '@services/analytics'
import { getBacklogThreshold } from '@services/bedrock-embeddings/batch/config'
import onError from '@modules/on-error'

const QUEUE_STATS_CACHE_TTL_MS = 2000

async function isSingleQueueBackedUp(): Promise<boolean> {
  try {
    const stats = await getQueueStatsCached(
      EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
      QUEUE_STATS_CACHE_TTL_MS,
    )
    return stats.waiting + stats.active >= getBacklogThreshold()
  } catch {
    return false
  }
}

const defaults = {
  attempts: BEDROCK_EMBEDDINGS_DEFAULTS.attempts,
  backoff: BEDROCK_EMBEDDINGS_DEFAULTS.backoff,
  removeOnComplete: BEDROCK_EMBEDDINGS_DEFAULTS.removeOnComplete,
  removeOnFail: BEDROCK_EMBEDDINGS_DEFAULTS.removeOnFail,
} satisfies Partial<JobOptions>

const enqueueCreateTopicEmbeddingJob = createEnqueueFunction<
  DefaultBedrockEmbeddingsJobData,
  'topic'
>({
  queue: bedrock_embeddings_nova_multimodal_v1_single,
  queueName: EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
  jobName: 'topic',
  defaults,
})

const enqueueCreatePostEmbeddingJob = createEnqueueFunction<
  DefaultBedrockEmbeddingsJobData,
  'post'
>({
  queue: bedrock_embeddings_nova_multimodal_v1_single,
  queueName: EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
  jobName: 'post',
  defaults,
})

const enqueueBulkCreateRssFeedItemEmbeddingJobs = createBulkEnqueueFunction<
  { rss_feed_item_id: string },
  { rss_feed_item_id: string },
  'rss_feed_item'
>({
  queue: bedrock_embeddings_nova_multimodal_v1_single,
  queueName: EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
  jobName: 'rss_feed_item',
  defaults,
  buildJob: item => ({
    data: { rss_feed_item_id: item.rss_feed_item_id },
    opts: {
      deduplication: {
        id: `rss_feed_item_embedding_${item.rss_feed_item_id}`,
        mode: 'debounce' as const,
        ttl: BEDROCK_EMBEDDINGS_DEFAULTS.deduplicationTtlMs,
      },
    },
  }),
})

export const enqueueCreateTopicEmbedding = async (
  topicId: string,
  priority?: number,
): Promise<void> => {
  if (await isSingleQueueBackedUp()) {
    trackAIEmbeddingShortCircuit({ reason: 'single_skipped_for_backlog', entityType: 'topic' })
    return
  }
  try {
    await enqueueCreateTopicEmbeddingJob({ id: topicId }, {
      priority: priority ?? PRIORITY_DEFAULT,
      deduplication: {
        id: `topic_embedding_${topicId}`,
        mode: 'debounce' as const,
        ttl: BEDROCK_EMBEDDINGS_DEFAULTS.deduplicationTtlMs,
      },
    } satisfies Partial<JobOptions>)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

export const enqueueCreatePostEmbedding = async (
  postId: string,
  priority?: number,
): Promise<void> => {
  if (await isSingleQueueBackedUp()) {
    trackAIEmbeddingShortCircuit({ reason: 'single_skipped_for_backlog', entityType: 'post' })
    return
  }
  try {
    await enqueueCreatePostEmbeddingJob({ id: postId }, {
      priority: priority ?? PRIORITY_DEFAULT,
      deduplication: {
        id: `post_embedding_${postId}`,
        mode: 'debounce' as const,
        ttl: BEDROCK_EMBEDDINGS_DEFAULTS.deduplicationTtlMs,
      },
    } satisfies Partial<JobOptions>)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

export const enqueueBulkCreateRssFeedItemEmbeddings = async (
  items: Array<{ rss_feed_item_id: string }>,
  priority?: number,
): Promise<void> => {
  if (await isSingleQueueBackedUp()) {
    trackAIEmbeddingShortCircuit({
      reason: 'single_skipped_for_backlog',
      entityType: 'rss_feed_item',
    })
    return
  }
  try {
    await enqueueBulkCreateRssFeedItemEmbeddingJobs(items, {
      priority: priority ?? PRIORITY_DEFAULT,
    } satisfies Partial<JobOptions>)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
