import type { JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { StoryClusteringJobData } from '../types.mts'

const ONE_MINUTE_MS = 60_000
const FIVE_SECONDS_MS = 5_000

export function enqueueStoryClustering(
  rss_feed_item_id: string,
  priority?: number,
  embeddingRetries = 0,
): Promise<void> {
  return enqueueBulkStoryClustering([{ rss_feed_item_id, embeddingRetries }], priority)
}

export function enqueueBulkStoryClustering(
  items: Array<{ rss_feed_item_id: string; embeddingRetries?: number }>,
  priority?: number,
): Promise<void> {
  if (items.length === 0) return Promise.resolve()
  const jobs = items.map(item => ({
    name: 'story-clustering' as const,
    data: {
      rss_feed_item_id: item.rss_feed_item_id,
      embedding_retries: item.embeddingRetries,
    } satisfies StoryClusteringJobData,
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: priority ?? AGENT_PRIORITY['story-clustering'],
      ...(item.embeddingRetries ? { delay: FIVE_SECONDS_MS } : {}),
      deduplication: {
        id: item.embeddingRetries
          ? `story_clustering_retry_${item.rss_feed_item_id}`
          : `story_clustering_${item.rss_feed_item_id}`,
        mode: 'debounce' as const,
        ttl: ONE_MINUTE_MS,
      },
    } satisfies JobOptions,
  }))
  return ai_agents
    .addBulk(jobs)
    .then(() => {
      trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'story-clustering', items.length)
      return undefined
    })
    .catch(onError)
}
