import { caches } from '@services/entity-cache/caches'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import type { PrivateUser, UserMetrics } from '@voucha/types/entities/user'
import {
  createTestUserDirect,
  followRssFeed,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import { describe, expect, it, vi } from 'vitest'
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

/**
 * A read-through fill discards `setBySerializedKeyIfNotInvalidated`. A follow refresh discards
 * the debounced job whose worker calls `refreshById`. Either promise is the write.
 */
async function expectRssFeedFollowingCount(
  user: PrivateUser,
  expectedCount: number,
): Promise<void> {
  let watch = watchNextUserMetricsWrite()
  let cached: UserMetrics | null = null
  try {
    await getUserMetricsByAnyCached(user.id)
    cached = (await caches.user_metrics.get(user.id)) as UserMetrics | null
    while (cached?.count.rss_feeds_following !== expectedCount) {
      await watch.done
      watch.stop()
      watch = watchNextUserMetricsWrite()
      cached = (await caches.user_metrics.get(user.id)) as UserMetrics | null
    }
  } finally {
    watch.stop()
  }
  expect(cached?.count.rss_feeds_following).toBe(expectedCount)
}

type UserMetricsWriter = {
  setBySerializedKeyIfNotInvalidated(
    serializedKey: string,
    value: unknown,
    ttl?: number,
  ): Promise<void>
  refreshById(
    aliases: readonly unknown[],
    fetchByKey: (key: unknown) => Promise<unknown>,
  ): Promise<unknown>
}

function watchNextUserMetricsWrite(): { done: Promise<void>; stop: () => void } {
  const cache = caches.user_metrics as unknown as UserMetricsWriter
  const gate = Promise.withResolvers<void>()
  let open = true
  const finish = () => {
    if (!open) return
    open = false
    gate.resolve()
  }
  const fill = cache.setBySerializedKeyIfNotInvalidated
  const refresh = cache.refreshById
  const fillSpy = vi
    .spyOn(cache, 'setBySerializedKeyIfNotInvalidated')
    .mockImplementation((serializedKey, value, ttl) => {
      const result = fill.call(cache, serializedKey, value, ttl)
      void result.finally(finish)
      return result
    })
  const refreshSpy = vi.spyOn(cache, 'refreshById').mockImplementation((aliases, fetchByKey) => {
    const result = refresh.call(cache, aliases, fetchByKey)
    void result.finally(finish)
    return result
  })
  return {
    done: gate.promise,
    stop() {
      fillSpy.mockRestore()
      refreshSpy.mockRestore()
    },
  }
}
