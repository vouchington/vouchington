import { trackRssFeedProcessingTruncated } from '@services/analytics'
import type { RssFeedItemBuildStats } from '@services/crawler-rss/clean'

type RssFeedProcessingTruncatedTracker = typeof trackRssFeedProcessingTruncated

export function trackRssFeedProcessingTruncationIfNeeded(
  rssFeedId: string,
  itemBuildStats: RssFeedItemBuildStats,
  trackTruncated: RssFeedProcessingTruncatedTracker = trackRssFeedProcessingTruncated,
): void {
  if (itemBuildStats.itemTruncatedCount === 0 && itemBuildStats.categoryTruncatedItemCount === 0) {
    return
  }

  // Category truncation counts are for returned items only; dropped items are counted separately.
  trackTruncated({
    rssFeedId,
    totalParsedItems: itemBuildStats.totalParsedItems,
    validItemsBeforeCap: itemBuildStats.validItemsBeforeCap,
    returnedItems: itemBuildStats.returnedItems,
    itemCap: itemBuildStats.itemCap,
    itemTruncatedCount: itemBuildStats.itemTruncatedCount,
    categoryCap: itemBuildStats.categoryCap,
    categoryTruncatedItemCount: itemBuildStats.categoryTruncatedItemCount,
    categoryTruncatedCount: itemBuildStats.categoryTruncatedCount,
  })
}
