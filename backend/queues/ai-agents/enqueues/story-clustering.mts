import type { JobOptions } from 'glide-mq'
import { v7 as uuidv7 } from 'uuid'
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
  batchId?: string,
): Promise<void> {
  return enqueueBulkStoryClustering([{ rss_feed_item_id, embeddingRetries, batchId }], priority)
}

export function enqueueBulkStoryClustering(
  items: Array<{ rss_feed_item_id: string; embeddingRetries?: number; batchId?: string }>,
  priority?: number,
): Promise<void> {
  if (items.length === 0) return Promise.resolve()
  const jobs = items.map(item => ({
    name: 'story-clustering' as const,
    data: {
      rss_feed_item_id: item.rss_feed_item_id,
      embedding_retries: item.embeddingRetries,
      // `uuidv7()` (not `randomUUID()`) so batch ids sort with time, matching
      // `services/autotagger/claim-autotagger-receipt.mts`'s identical precedent --
      // `classifier_decision_batches` itself is keyed and time-derived off a v7 id
      // (`0635-00-00-classifiers.sql`).
      batch_id: item.batchId ?? uuidv7(),
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
