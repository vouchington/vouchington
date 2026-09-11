import type { JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { AutotaggerRssFeedItemJobData } from '../types.mts'

const FIVE_SECONDS_MS = 5000

export function enqueueAutotaggerRssFeedItem(rss_feed_item_id: string, embeddingRetries = 0): void {
  enqueueBulkAutotaggerRssFeedItems([{ rss_feed_item_id, embeddingRetries }])
}

export function enqueueBulkAutotaggerRssFeedItems(
  items: Array<{ rss_feed_item_id: string; embeddingRetries?: number }>,
): void {
  if (items.length === 0) return
  const jobs = items.map(item => ({
    name: 'autotagger-rss-feed-item' as const,
    data: {
      rss_feed_item_id: item.rss_feed_item_id,
      embedding_retries: item.embeddingRetries,
    } satisfies AutotaggerRssFeedItemJobData,
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['autotagger-rss-feed-item'],
      delay: FIVE_SECONDS_MS,
      deduplication: {
        id: `autotagger_rss_feed_item_${item.rss_feed_item_id}`,
        mode: 'debounce' as const,
        ttl: FIVE_SECONDS_MS,
      },
    } satisfies JobOptions,
  }))
  ai_agents.addBulk(jobs).catch(onError)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'autotagger-rss-feed-item', items.length)
}
