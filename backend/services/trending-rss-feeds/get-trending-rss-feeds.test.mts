import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestRssFeed,
  insertTestTopic,
  insertEntityRelation,
} from '@voucha/test-helpers'
import { updateRssFeedById } from '@services/rss-feeds/update'
import { getTrendingRssFeeds } from './get-trending-rss-feeds.mts'

async function followRssFeed(userId: string, feedId: string): Promise<void> {
  await insertEntityRelation('relation__user__follow__rss_feed', userId, feedId)
}

async function createTrendingFeedData(followCount: number): Promise<{
  feedId: string
  topicId: string
}> {
  const random = Math.random().toString(36).slice(2, 15)
  const admin = await createTestUser({ administrator: true })
  const topicId = await insertTestTopic({
    name: `Trending Feed Topic ${random}`,
    slug: `trending-feed-topic-${random}`,
    createdById: admin.id,
  })
  const feedId = await insertTestRssFeed({ topicId, title: `Trending Feed ${random}` })

  for (let i = 0; i < followCount; i++) {
    const user = await createTestUser()
    await followRssFeed(user.id, feedId)
  }

  return { feedId, topicId }
}

describe('getTrendingRssFeeds', () => {
  it('returns feeds ordered by trending_score DESC', async () => {
    const { feedId: highFeedId } = await createTrendingFeedData(20)
    const { feedId: lowFeedId } = await createTrendingFeedData(10)

    const result = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 5 })
    const ids = result.results.map(r => r.id)

    const highIdx = ids.indexOf(highFeedId)
    const lowIdx = ids.indexOf(lowFeedId)

    expect(highIdx).toBeGreaterThanOrEqual(0)
    expect(lowIdx).toBeGreaterThanOrEqual(0)
    expect(highIdx).toBeLessThan(lowIdx)
  })

  it('includes follow_count and item_count in results', async () => {
    const { feedId } = await createTrendingFeedData(20)

    const result = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 10 })
    const found = result.results.find(r => r.id === feedId)

    expect(found).toBeDefined()
    expect(found?.follow_count).toBeGreaterThanOrEqual(20)
    expect(typeof found?.item_count).toBe('number')
  })

  it('supports pagination with after cursor', async () => {
    await Promise.all([
      createTrendingFeedData(3),
      createTrendingFeedData(2),
      createTrendingFeedData(1),
    ])

    const first = await getTrendingRssFeeds({ timeRange: 'week', limit: 1 })
    expect(first.results).toHaveLength(1)
    expect(first.page_info.end_cursor).not.toBeNull()

    const second = await getTrendingRssFeeds({
      timeRange: 'week',
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(second.results[0].id).not.toBe(first.results[0].id)
    expect(second.results[0].trending_score).toBeLessThanOrEqual(first.results[0].trending_score)
  })

  it('filters by minScore', async () => {
    const { feedId: highFeedId } = await createTrendingFeedData(10)
    const { feedId: lowFeedId } = await createTrendingFeedData(1)

    // high feed has score 30 (10 follows * 3.0), low feed has score 3.0
    const result = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 10 })
    const ids = result.results.map(r => r.id)

    expect(ids).toContain(highFeedId)
    expect(ids).not.toContain(lowFeedId)
  })

  it('excludes disabled and undiscoverable feeds', async () => {
    const { feedId: disabledFeedId } = await createTrendingFeedData(10)
    const { feedId: hiddenFeedId } = await createTrendingFeedData(10)
    await updateRssFeedById(disabledFeedId, { enabled: false, discoverable: true })
    await updateRssFeedById(hiddenFeedId, { enabled: true, discoverable: false })

    const result = await getTrendingRssFeeds({ timeRange: 'week', limit: 100, minScore: 10 })
    const ids = result.results.map(r => r.id)

    expect(ids).not.toContain(disabledFeedId)
    expect(ids).not.toContain(hiddenFeedId)
  })

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
