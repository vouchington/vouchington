import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  followUser,
  insertTestStory,
  setRssFeedItemShareSortAtForTest,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import {
  processFollowerDistributionChunk,
  shareRssFeedItemWithFollowers,
} from '@services/follower-distributions'
import { getRssFeedItemFeedIds } from '../get-ids.mts'

const DAY_MS = 24 * 60 * 60 * 1000

function isRequestedRssIdCollision(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const postgresError = error as { code?: unknown; constraint?: unknown }
  return postgresError.code === '23505' && postgresError.constraint === 'rss_feed_item_guids_pkey'
}

describe('RSS feed decision instant', () => {
  it('uses one inclusive cutoff for direct UUIDs and shared delivery timestamps', async () => {
    const viewer = await createTestUser()
    const sharer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await Promise.all([followRssFeed(viewer, feedId), followUser(viewer, sharer)])

    let cutoffMs = 0
    let equal: Awaited<ReturnType<typeof createTestRssFeedItemWithUrl>> | undefined
    for (let attempt = 0; attempt < 5; attempt++) {
      cutoffMs = Date.now() - randomInt(1, 12 * 60 * 60 * 1000)
      const candidate = getMinUUIDv7ForDate(new Date(cutoffMs))
      try {
        equal = await createTestRssFeedItemWithUrl(feedId, {
          id: candidate,
          createdAt: new Date(cutoffMs),
        })
        if (equal.id !== candidate) throw new Error('RSS fixture returned a different ID')
        break
      } catch (err) {
        if (!isRequestedRssIdCollision(err)) throw err
      }
    }
    if (!equal) throw new Error('Unable to reserve an owned RSS cutoff item ID')

    const older = await createTestRssFeedItemWithUrl(feedId, {
      createdAt: new Date(cutoffMs - 1),
    })
    const newer = await createTestRssFeedItemWithUrl(feedId, {
      createdAt: new Date(cutoffMs + 1),
    })
    const story = await insertTestStory({ officialRssFeedItemId: older.id })
    await Promise.all([
      setTestItemStoryId(older.id, story.id),
      setTestItemStoryId(equal.id, story.id),
    ])

    for (const [item, delta] of [
      [older, -1],
      [equal, 0],
      [newer, 1],
    ] as const) {
      await processFollowerDistributionChunk(
        (await shareRssFeedItemWithFollowers(sharer, item.id)).distribution_id,
      )
      await setRssFeedItemShareSortAtForTest({
        recipientUserId: viewer.id,
        rssFeedItemId: item.id,
        sharedByUserId: sharer.id,
        sortAt: new Date(cutoffMs + delta),
      })
    }

    const asOf = new Date(cutoffMs + DAY_MS)
    const windowed = await getRssFeedItemFeedIds(
      viewer,
      { feed_type: 'any', time_range: '1d', limit: 25 },
      asOf,
    )
    expect(windowed.results.map(row => [row.entity_id, row.delivery_type]).toSorted()).toEqual(
      [
        [equal.id, 'direct'],
        [equal.id, 'share'],
        [newer.id, 'direct'],
        [newer.id, 'share'],
      ].toSorted(),
    )

    const unbounded = await getRssFeedItemFeedIds(
      viewer,
      { feed_type: 'any', time_range: 'all', limit: 25 },
      asOf,
    )
    expect(unbounded.results.map(row => [row.entity_id, row.delivery_type]).toSorted()).toEqual(
      [
        [older.id, 'direct'],
        [older.id, 'share'],
        [equal.id, 'share'],
        [newer.id, 'direct'],
        [newer.id, 'share'],
      ].toSorted(),
    )
  })
})
