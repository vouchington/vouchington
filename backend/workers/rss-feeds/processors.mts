import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import type { RssFeedDispatcherJobs, RssFeedsJobs } from '@queues/rss-feeds/types'
import { TIER_PRIORITY } from '@queues/rss-feeds/config'
import {
  fetchRssFeed,
  getRssFeedsToFetch,
  getTierSlaMs,
  type RssFeedCrawlTier,
} from '@services/rss-feeds'
import type { Job } from 'glide-mq'

type RssFeedsDispatcherDependencies = {
  enqueueBulkFetchRssFeeds: typeof enqueueBulkFetchRssFeeds
  getRssFeedsToFetch: typeof getRssFeedsToFetch
  getTierSlaMs: typeof getTierSlaMs
}
type FetchRssFeedDependencies = {
  fetchRssFeed: typeof fetchRssFeed
}
type RssFeedsJobDependencies = {
  processFetchRssFeed: typeof processFetchRssFeed
  processRssFeedsDispatcher: typeof processRssFeedsDispatcher
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/queues/workers/rss-feeds/README.md`.
 */
export async function processRssFeedsDispatcher(
  dependencies?: Partial<RssFeedsDispatcherDependencies>,
): Promise<{ count: number }> {
  const deps = {
    enqueueBulkFetchRssFeeds,
    getRssFeedsToFetch,
    getTierSlaMs,
    ...dependencies,
  }
  const feeds = await deps.getRssFeedsToFetch()
  if (feeds.length === 0) return { count: 0 }

  // Group feeds by (tier, ttl) so each group shares one priority value and TTL.
  // Backfill feeds use ttl=undefined so the worker does not reapply the full tier SLA check.
  const groups = new Map<string, { tier: number; ttl: number | undefined; ids: string[] }>()

  for (const feed of feeds) {
    const tier = feed.crawl_tier >= 1 && feed.crawl_tier <= 5 ? feed.crawl_tier : 5
    const ttl = feed.priority_group === 2 ? undefined : deps.getTierSlaMs(tier as RssFeedCrawlTier)
    const key = `${tier}:${ttl ?? 'none'}`

    const group = groups.get(key)
    if (group) {
      group.ids.push(feed.id)
    } else {
      groups.set(key, { tier, ttl, ids: [feed.id] })
    }
  }

  await Promise.all(
    Array.from(groups.values()).map(({ tier, ttl, ids }) =>
      deps.enqueueBulkFetchRssFeeds(ids, {
        priority: TIER_PRIORITY[tier] ?? TIER_PRIORITY[5],
        ttl,
      }),
    ),
  )

  return { count: feeds.length }
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review.
 * Evidence: `docs/overview/architecture/queues/workers/rss-feeds/README.md`.
 */
export async function processFetchRssFeed(
  rssFeedId: string,
  ttl?: number,
  dependencies?: Partial<FetchRssFeedDependencies>,
): Promise<{ rss_feed_id: string; item_count: number }> {
  const deps = { fetchRssFeed, ...dependencies }
  const items = await deps.fetchRssFeed(rssFeedId, ttl)
  return { rss_feed_id: rssFeedId, item_count: items.length }
}

export async function processRssFeedsJob(
  job: Job,
  dependencies?: Partial<RssFeedsJobDependencies>,
): Promise<unknown> {
  const deps = { processFetchRssFeed, processRssFeedsDispatcher, ...dependencies }
  const orderingKey = job.opts?.ordering?.key

  switch (orderingKey) {
    case 'dispatcher': {
      switch (job.name as RssFeedDispatcherJobs) {
        case 'dispatchRssFeeds':
          return deps.processRssFeedsDispatcher()
        default:
          throw new Error(`RSS feed dispatcher job ${job.name} not found`)
      }
    }
    case 'fetch': {
      switch (job.name as RssFeedsJobs) {
        case 'fetchRssFeed': {
          const rssFeedId = job.data?.rssFeedId
          const ttl = job.data?.ttl
          if (!rssFeedId) throw new Error('RSS feed job .rssFeedId is required')
          return deps.processFetchRssFeed(rssFeedId, typeof ttl === 'number' ? ttl : undefined)
        }
        default:
          throw new Error(`RSS feed job ${job.name} not found`)
      }
    }
    default:
      throw new Error(`Unknown ordering key: ${orderingKey}`)
  }
}
