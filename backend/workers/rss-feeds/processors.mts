import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { TIER_PRIORITY } from '@queues/rss-feeds/config'
import {
  fetchRssFeed,
  getRssFeedsToFetch,
  getTierSlaMs,
  type RssFeedDispatchCursor,
  type RssFeedCrawlTier,
} from '@services/rss-feeds'

type RssFeedsDispatcherDependencies = {
  enqueueBulkFetchRssFeeds: typeof enqueueBulkFetchRssFeeds
  getRssFeedsToFetch: typeof getRssFeedsToFetch
  getTierSlaMs: typeof getTierSlaMs
}
type FetchRssFeedDependencies = {
  fetchRssFeed: typeof fetchRssFeed
}

export async function processRssFeedsDispatcher(
  dependencies?: Partial<RssFeedsDispatcherDependencies>,
  page?: { cursor?: RssFeedDispatchCursor; asOf: Date; limit: number },
): Promise<{ count: number; nextCursor?: RssFeedDispatchCursor }> {
  const deps = {
    enqueueBulkFetchRssFeeds,
    getRssFeedsToFetch,
    getTierSlaMs,
    ...dependencies,
  }
  const feeds = await deps.getRssFeedsToFetch(
    page ? { limit: page.limit, cursor: page.cursor, asOf: page.asOf } : {},
  )
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

  const last = feeds.at(-1)
  return {
    count: feeds.length,
    ...(page && feeds.length === page.limit && last
      ? { nextCursor: { lane: last.dispatch_lane, afterId: last.id } }
      : {}),
  }
}

export async function processFetchRssFeed(
  rssFeedId: string,
  ttl?: number,
  dependencies?: Partial<FetchRssFeedDependencies>,
): Promise<{ rss_feed_id: string; item_count: number }> {
  const deps = { fetchRssFeed, ...dependencies }
  const items = await deps.fetchRssFeed(rssFeedId, ttl)
  return { rss_feed_id: rssFeedId, item_count: items.length }
}
