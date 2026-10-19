import { describe, it, expect } from 'vitest'
import { getTrendingRssFeeds } from './get-trending-rss-feeds.mts'

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
})
