import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { BEDROCK_EMBEDDINGS_DEFAULTS, PRIORITY_DEFAULT } from './config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import type { DefaultBedrockEmbeddingsJobData } from './types.mts'
import { trackAIEmbeddingShortCircuit } from '@services/analytics'
import onError from '@modules/on-error'
import { isSingleEmbeddingBackedUp } from './enqueues/single-backlog.mts'

async function isSingleQueueBackedUp(): Promise<boolean> {
  try {
    return await isSingleEmbeddingBackedUp()
  } catch {
    return false
  }
}

const enqueueCreateTopicEmbeddingJob = createEnqueueFunction<
  DefaultBedrockEmbeddingsJobData,
  string
>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'bedrock-embeddings.topic',
  defaults: requireBackgroundCpuJob('bedrock-embeddings.topic').options,
})

const enqueueCreatePostEmbeddingJob = createEnqueueFunction<
  DefaultBedrockEmbeddingsJobData,
  string
>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'bedrock-embeddings.post',
  defaults: requireBackgroundCpuJob('bedrock-embeddings.post').options,
})

const enqueueBulkCreateRssFeedItemEmbeddingJobs = createBulkEnqueueFunction<
  { rss_feed_item_id: string },
  { rss_feed_item_id: string },
  string
>({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'bedrock-embeddings.rss_feed_item',
  defaults: requireBackgroundCpuJob('bedrock-embeddings.rss_feed_item').options,
  buildJob: item => ({
    data: { rss_feed_item_id: item.rss_feed_item_id },
    opts: {
      deduplication: {
        id: `bedrock-embeddings:single:rss-feed-item:${item.rss_feed_item_id}`,
        mode: 'debounce' as const,
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
        id: `bedrock-embeddings:single:topic:${topicId}`,
        mode: 'debounce' as const,
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
        id: `bedrock-embeddings:single:post:${postId}`,
        mode: 'debounce' as const,
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
