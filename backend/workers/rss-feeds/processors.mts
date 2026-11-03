import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'
import { TIER_PRIORITY } from '@queues/rss-feeds/config'
import {
  fetchRssFeed,
  getRssFeedsToFetch,
  getTierSlaMs,
  type RssFeedDispatchCursor,
  type RssFeedCrawlTier,
} from '@services/rss-feeds'

export async function processRssFeedsDispatcher(page?: {
  cursor?: RssFeedDispatchCursor
  asOf: Date
  limit: number
  rawBudget: number
}): Promise<{ count: number; rawRowsRead: number; nextCursor?: RssFeedDispatchCursor }> {
  const result = await getRssFeedsToFetch(
    page
      ? { limit: page.limit, rawBudget: page.rawBudget, cursor: page.cursor, asOf: page.asOf }
      : {},
  )
  const feeds = result.feeds

  // Group feeds by (tier, ttl) so each group shares one priority value and TTL.
  // Backfill feeds use ttl=undefined so the worker does not reapply the full tier SLA check.
  const groups = new Map<string, { tier: number; ttl: number | undefined; ids: string[] }>()

  for (const feed of feeds) {
    const tier = feed.crawl_tier >= 1 && feed.crawl_tier <= 5 ? feed.crawl_tier : 5
    const ttl = feed.priority_group === 2 ? undefined : getTierSlaMs(tier as RssFeedCrawlTier)
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
      enqueueBulkFetchRssFeeds(ids, {
        priority: TIER_PRIORITY[tier] ?? TIER_PRIORITY[5],
        ttl,
      }),
    ),
  )

  return {
    count: feeds.length,
    rawRowsRead: result.rawRowsRead,
    ...(result.nextCursor && { nextCursor: result.nextCursor }),
  }
}

export async function processFetchRssFeed(
  rssFeedId: string,
  ttl?: number,
): Promise<{ rss_feed_id: string; item_count: number }> {
  const items = await fetchRssFeed(rssFeedId, ttl)
  return { rss_feed_id: rssFeedId, item_count: items.length }
}
