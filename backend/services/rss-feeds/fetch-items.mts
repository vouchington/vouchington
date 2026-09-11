import { buildBoundedRssFeedItemsFromFeed } from '@services/crawler-rss/clean'
import { trackRssFeedProcessingTruncationIfNeeded } from './processing-analytics.mts'

export function buildTrackedRssFeedItemsFromFeed(
  rssFeedId: string,
  parsedFeed: Record<string, unknown>,
  feedUrl: string,
) {
  const { items: validItems, stats } = buildBoundedRssFeedItemsFromFeed(parsedFeed, feedUrl)
  trackRssFeedProcessingTruncationIfNeeded(rssFeedId, stats)
  return validItems
}
