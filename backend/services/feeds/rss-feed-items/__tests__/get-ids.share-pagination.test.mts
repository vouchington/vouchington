import { it, expect, describe } from 'vitest'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import {
  followRssFeed,
  followUser,
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestStory,
  setTestItemStoryId,
  setTestRssFeedItemVotes,
  setRssFeedItemShareSortAtForTest,
} from '@voucha/test-helpers'
import {
  processFollowerDistributionChunk,
  shareRssFeedItemWithFollowers,
} from '@services/follower-distributions'

describe('RSS direct and share pagination', () => {
  it('pagination across direct and shared items returns no duplicates', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(follower, feedId)
    await followUser(follower, sharer)

    // Create 2 direct items + 1 shared item
    const item1 = await createTestRssFeedItemWithUrl(feedId)
    const item2 = await createTestRssFeedItemWithUrl(feedId)
    const sharedItem = await createTestRssFeedItemWithUrl(feedId)
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, sharedItem.id)).distribution_id,
    )

    const page1 = await getRssFeedItemFeedIds(follower, { feed_type: 'any', limit: 2 })
    expect(page1.results.length).toBe(2)
    expect(page1.page_info.has_next_page).toBe(true)

    const page2 = await getRssFeedItemFeedIds(follower, {
      feed_type: 'any',
      after: page1.page_info.end_cursor!,
      limit: 2,
    })
    expect(page2.results.length).toBeGreaterThanOrEqual(1)

    const allIds = [...page1.results, ...page2.results].map(r => r.id)
    // No duplicate result IDs across pages
    expect(new Set(allIds).size).toBe(allIds.length)
    // All item UUIDs appear somewhere
    const allEntityIds = [...page1.results, ...page2.results].map(r => r.entity_id)
    expect(allEntityIds).toContain(item1.id)
    expect(allEntityIds).toContain(item2.id)
    expect(allEntityIds).toContain(sharedItem.id)
  })

  it('keeps an independent same-story share and canonical direct row across a tied cursor', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(follower, feedId)
    await followUser(follower, sharer)

    const tiedAt = new Date(Date.now() + 5 * 60_000)
    const directItemSortAt = new Date(tiedAt.getTime() + 1000)
    const directItem = await createTestRssFeedItemWithUrl(feedId, { createdAt: directItemSortAt })
    const sharedItem = await createTestRssFeedItemWithUrl(feedId, { createdAt: tiedAt })
    const story = await insertTestStory({ officialRssFeedItemId: directItem.id })
    await Promise.all([
      setTestItemStoryId(directItem.id, story.id),
      setTestItemStoryId(sharedItem.id, story.id),
      setTestRssFeedItemVotes(directItem.id, 1),
      setTestRssFeedItemVotes(sharedItem.id, 1),
    ])
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, sharedItem.id)).distribution_id,
    )
    await setRssFeedItemShareSortAtForTest({
      recipientUserId: follower.id,
      rssFeedItemId: sharedItem.id,
      sharedByUserId: sharer.id,
      sortAt: directItemSortAt,
    })

    const page1 = await getRssFeedItemFeedIds(follower, { feed_type: 'any', limit: 1 })
    expect(page1.results).toHaveLength(1)
    expect(page1.page_info.has_next_page).toBe(true)

    const page2 = await getRssFeedItemFeedIds(follower, {
      feed_type: 'any',
      after: page1.page_info.end_cursor!,
      limit: 1,
    })
    expect(page2.results).toHaveLength(1)
    expect([...page1.results, ...page2.results]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity_id: sharedItem.id, delivery_type: 'share' }),
        expect.objectContaining({ entity_id: directItem.id, delivery_type: 'direct' }),
      ]),
    )
    expect(page1.results[0]!.id.localeCompare(page2.results[0]!.id)).toBeGreaterThan(0)
    expect(page2.page_info.has_next_page).toBe(false)
  })
})
