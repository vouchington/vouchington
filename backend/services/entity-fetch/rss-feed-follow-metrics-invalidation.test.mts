import { caches } from '@services/entity-cache/caches'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import type { PrivateUser, UserMetrics } from '@voucha/types/entities/user'
import {
  createTestUserDirect,
  followRssFeed,
  insertTestRssFeed,
  insertTestTopic,
  pollUntilNotNull,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { getUserMetricsByAnyCached } from './metrics.mts'

describe('RSS feed follow user metrics refresh', () => {
  it('refreshes the following source count after following an RSS feed', async () => {
    const { user, rssFeedId } = await createFixture()
    await expectRssFeedFollowingCount(user, 0)

    await bookmarkEntity(user, 'rss_feed', { id: rssFeedId }, 'follow')

    await expectRssFeedFollowingCount(user, 1)
  })

  it('refreshes the following source count after unfollowing an RSS feed', async () => {
    const { user, rssFeedId } = await createFixture()
    await followRssFeed(user, rssFeedId)
    await expectRssFeedFollowingCount(user, 1)

    await unbookmarkEntity(user, 'rss_feed', { id: rssFeedId }, 'follow')

    await expectRssFeedFollowingCount(user, 0)
  })
})

async function createFixture(): Promise<{ user: PrivateUser; rssFeedId: string }> {
  const user = await createTestUserDirect()
  const random = Math.random().toString(36).slice(2, 15)
  const topicId = await insertTestTopic({
    name: `RSS Feed Metrics ${random}`,
    slug: `rss-feed-metrics-${random}`,
    createdById: user.id,
  })
  const rssFeedId = await insertTestRssFeed({
    topicId,
    title: `RSS Feed Metrics ${random}`,
  })
  return { user, rssFeedId }
}

async function expectRssFeedFollowingCount(
  user: PrivateUser,
  expectedCount: number,
): Promise<void> {
  await getUserMetricsByAnyCached(user.id)
  const metrics = await pollUntilNotNull(async () => {
    const cached = (await caches.user_metrics.get(user.id)) as UserMetrics | null
    return cached?.count.rss_feeds_following === expectedCount ? cached : null
  }, 10_000)
  expect(metrics?.count.rss_feeds_following).toBe(expectedCount)
}
