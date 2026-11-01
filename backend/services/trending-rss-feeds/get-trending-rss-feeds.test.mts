import { describe, expect, it } from 'vitest'
import { refreshMaterializedView } from '@data-stores/psql/migrate'
import { updateRssFeedById } from '@services/rss-feeds/update'
import { createNativeTrendingFeed } from '@voucha/test-helpers/native-trending-rss-feeds'
import { getTrendingRssFeeds } from './get-trending-rss-feeds.mts'

const refreshTrendingFeeds = () => refreshMaterializedView('mv_trending_rss_feeds')

describe('getTrendingRssFeeds', () => {
  it('throws 400 for invalid time_range', async () => {
    await expect(
      getTrendingRssFeeds({ timeRange: 'year' as 'day' | 'week' | 'month', limit: 20 }),
    ).rejects.toThrow(Error)
  })

  it('throws 400 for invalid cursor', async () => {
    await expect(
      getTrendingRssFeeds({ timeRange: 'day', limit: 20, after: 'badinput!!' }),
    ).rejects.toThrow(Error)
  })

  // no-mistakes-timeout-reason: twenty follower rows are inserted one at a time, then the view is refreshed
  it('returns a higher follow count ahead of a lower one', { timeout: 15_000 }, async () => {
    const [highFeedId, lowFeedId] = await Promise.all([
      createNativeTrendingFeed(20),
      createNativeTrendingFeed(10),
    ])
    await refreshTrendingFeeds()

    const ordered = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 5 })
    const ownedIds = ordered.results
      .filter(row => row.id === highFeedId || row.id === lowFeedId)
      .map(row => row.id)

    expect(ownedIds).toEqual([highFeedId, lowFeedId])
  })

  // no-mistakes-timeout-reason: twenty follower rows are inserted one at a time, then the view is refreshed
  it('includes follow_count and item_count for an owned feed', { timeout: 15_000 }, async () => {
    const countedFeedId = await createNativeTrendingFeed(20)
    await refreshTrendingFeeds()

    const counted = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 10 })
    const countedFeed = counted.results.find(row => row.id === countedFeedId)

    expect(countedFeed?.id).toBe(countedFeedId)
    expect(countedFeed?.follow_count).toBeGreaterThanOrEqual(20)
    expect(typeof countedFeed?.item_count).toBe('number')
  })

  it('advances a week page by score cursor', async () => {
    await Promise.all([
      createNativeTrendingFeed(3),
      createNativeTrendingFeed(2),
      createNativeTrendingFeed(1),
    ])
    await refreshTrendingFeeds()

    const first = await getTrendingRssFeeds({ timeRange: 'week', limit: 1 })
    expect(first.results).toHaveLength(1)
    expect(first.page_info.end_cursor).not.toBeNull()

    const second = await getTrendingRssFeeds({
      timeRange: 'week',
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(second.results).toHaveLength(1)
    expect(second.results[0]?.id).not.toBe(first.results[0]?.id)
    expect(second.results[0]?.trending_score).toBeLessThanOrEqual(first.results[0]!.trending_score)
  })

  it('omits a feed below minScore', async () => {
    const [thresholdHighId, thresholdLowId] = await Promise.all([
      createNativeTrendingFeed(10),
      createNativeTrendingFeed(1),
    ])
    await refreshTrendingFeeds()

    const threshold = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 10 })
    const thresholdIds = threshold.results.map(row => row.id)

    expect(thresholdIds).toContain(thresholdHighId)
    expect(thresholdIds).not.toContain(thresholdLowId)
  })

  it('omits a disabled feed and a hidden feed', async () => {
    const [disabledId, hiddenId] = await Promise.all([
      createNativeTrendingFeed(10),
      createNativeTrendingFeed(10),
    ])
    await Promise.all([
      updateRssFeedById(disabledId, { is_enabled: false, discoverable: true }),
      updateRssFeedById(hiddenId, { is_enabled: true, discoverable: false }),
    ])
    await refreshTrendingFeeds()

    const visible = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 10 })
    const visibleIds = visible.results.map(row => row.id)

    expect(visibleIds).not.toContain(disabledId)
    expect(visibleIds).not.toContain(hiddenId)
  })
})
