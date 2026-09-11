import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { RssFeedItemBuildStats } from '@services/crawler-rss/clean'
import { trackRssFeedProcessingTruncationIfNeeded } from './processing-analytics.mts'

describe('processing-analytics', () => {
  const trackRssFeedProcessingTruncated = vi.fn<VitestLooseMock>()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips analytics when no item or retained-category truncation happened', () => {
    trackRssFeedProcessingTruncationIfNeeded(
      'rss-feed-id',
      makeStats({}),
      trackRssFeedProcessingTruncated,
    )

    expect(trackRssFeedProcessingTruncated).not.toHaveBeenCalled()
  })

  it('tracks analytics when truncation happened', () => {
    trackRssFeedProcessingTruncationIfNeeded(
      'rss-feed-id',
      makeStats({ itemTruncatedCount: 2, categoryTruncatedCount: 3 }),
      trackRssFeedProcessingTruncated,
    )

    expect(trackRssFeedProcessingTruncated).toHaveBeenCalledWith(
      expect.objectContaining({
        rssFeedId: 'rss-feed-id',
        itemTruncatedCount: 2,
        categoryTruncatedCount: 3,
      }),
    )
  })
})

function makeStats(overrides: Partial<RssFeedItemBuildStats>): RssFeedItemBuildStats {
  return {
    totalParsedItems: 10,
    validItemsBeforeCap: 9,
    returnedItems: 8,
    itemCap: 500,
    itemTruncatedCount: 0,
    categoryCap: 20,
    categoryTruncatedItemCount: 0,
    categoryTruncatedCount: 0,
    ...overrides,
  }
}
