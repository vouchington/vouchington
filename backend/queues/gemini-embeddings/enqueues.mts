import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT } from './config.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { createBackgroundCpuEnqueueFunction } from '@queues/background-cpu/enqueues/typed-job'
import type { BackgroundCpuJobPayloads } from '@queues/background-cpu/types'
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

const enqueueCreateTopicEmbeddingJob = createBackgroundCpuEnqueueFunction('gemini-embeddings.topic')
const enqueueCreatePostEmbeddingJob = createBackgroundCpuEnqueueFunction('gemini-embeddings.post')
const RSS_FEED_ITEM_JOB_NAME = 'gemini-embeddings.rss_feed_item'

const enqueueBulkCreateRssFeedItemEmbeddingJobs = createBulkEnqueueFunction({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: RSS_FEED_ITEM_JOB_NAME,
  defaults: requireBackgroundCpuJob(RSS_FEED_ITEM_JOB_NAME).options,
  buildJob: (item: { rss_feed_item_id: string }) => ({
    data: {
      rss_feed_item_id: item.rss_feed_item_id,
    } satisfies BackgroundCpuJobPayloads[typeof RSS_FEED_ITEM_JOB_NAME],
    opts: {
      deduplication: {
        id: `gemini-embeddings:single:rss-feed-item:${item.rss_feed_item_id}`,
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
        id: `gemini-embeddings:single:topic:${topicId}`,
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
        id: `gemini-embeddings:single:post:${postId}`,
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
