import {
  createTestUser,
  holdTopicRatingRefreshLock,
  insertTestTopic,
  isTopicRatingRefreshWaiting,
} from '@voucha/test-helpers'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { updateTopicRatingStats } from './ratings.mts'

describe('topic rating refresh concurrency', () => {
  it('serializes concurrent refreshes for the same topic', async () => {
    const random = randomUUID()
    const user = await createTestUser({ username: `serialized-rating-${random}` })
    const topicId = await insertTestTopic({
      name: `Serialized rating ${random}`,
      slug: `serialized-rating-${random}`,
      createdById: user!.id,
    })
    const lockAcquired = Promise.withResolvers<void>()
    const releaseLock = Promise.withResolvers<void>()
    const blocker = holdTopicRatingRefreshLock(topicId, async () => {
      lockAcquired.resolve()
      await releaseLock.promise
    })
    await lockAcquired.promise

    let refreshCompleted = false
    const refresh = updateTopicRatingStatsAndMarkComplete()

    async function updateTopicRatingStatsAndMarkComplete(): Promise<void> {
      await updateTopicRatingStats(topicId)
      refreshCompleted = true
    }
    try {
      await expect.poll(isTopicRatingRefreshWaiting, { timeout: 1_000 }).toBe(true)
      expect(refreshCompleted).toBe(false)
    } finally {
      releaseLock.resolve()
      await Promise.allSettled([blocker, refresh])
    }
    expect(refreshCompleted).toBe(true)
  })
})
