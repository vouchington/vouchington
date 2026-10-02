import { describe, expect, it } from 'vitest'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  insertTestStory,
  setTestItemStoryId,
  setRssFeedItemMediaType,
  addRssFeedItemSource,
  addCategoryToRssFeedItem,
  followTopic,
  followUser,
  setTestRssFeedItemVotes,
} from '@voucha/test-helpers'
import {
  processFollowerDistributionChunk,
  shareRssFeedItemWithFollowers,
} from '@services/follower-distributions'

describe('getRssFeedItemFeedIds dedup pagination', () => {
  it('deduplicates overlapping source and topic memberships before selecting story winners', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const otherTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const otherFeedId = await createTestRssFeedWithTiming(otherTopic.id)
    await Promise.all([
      followRssFeed(user, feedId),
      followRssFeed(user, otherFeedId),
      followTopic(user, topic),
    ])
    const item = await createTestRssFeedItemWithUrl(feedId)
    await Promise.all([
      addRssFeedItemSource(otherFeedId, item.id),
      addCategoryToRssFeedItem(item.id, topic.id, 'first'),
      addCategoryToRssFeedItem(item.id, topic.id, 'second'),
    ])

    for (const feed_type of ['any', 'all', 'follow_rss_feeds', 'follow_topics'] as const) {
      const page = await getRssFeedItemFeedIds(user, { feed_type, limit: 1 })
      expect(page.results.map(row => row.entity_id)).toEqual([item.id])
      expect(page.page_info.has_next_page).toBe(false)
    }
  })

  it('ranks eligible story siblings by score and then UUID without an official item', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)
    const scoreStory = await insertTestStory()
    const tieStory = await insertTestStory()
    const items = await Promise.all(
      Array.from({ length: 4 }, () => createTestRssFeedItemWithUrl(feedId)),
    )
    await Promise.all([
      setTestItemStoryId(items[0].id, scoreStory.id),
      setTestItemStoryId(items[1].id, scoreStory.id),
      setTestItemStoryId(items[2].id, tieStory.id),
      setTestItemStoryId(items[3].id, tieStory.id),
      setTestRssFeedItemVotes(items[0].id, 3),
      setTestRssFeedItemVotes(items[1].id, 1),
    ])
    const page = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 10 })
    expect(page.results.map(row => row.entity_id).toSorted()).toEqual(
      [items[0].id, [items[2].id, items[3].id].toSorted().at(-1)!].toSorted(),
    )
    expect(page.page_info.has_next_page).toBe(false)
  })

  it('keeps shared story members separate from the canonical direct member', async () => {
    const user = await createTestUser()
    const sharer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await Promise.all([followRssFeed(user, feedId), followUser(user, sharer)])
    const official = await createTestRssFeedItemWithUrl(feedId)
    const sibling = await createTestRssFeedItemWithUrl(feedId)
    const story = await insertTestStory({ officialRssFeedItemId: official.id })
    await Promise.all([
      setTestItemStoryId(official.id, story.id),
      setTestItemStoryId(sibling.id, story.id),
    ])
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, sibling.id)).distribution_id,
    )

    const page = await getRssFeedItemFeedIds(user, { feed_type: 'any', limit: 10 })
    expect(page.results.map(row => [row.entity_id, row.delivery_type])).toEqual([
      [sibling.id, 'share'],
      [official.id, 'direct'],
    ])
    expect(page.page_info.has_next_page).toBe(false)
  })
  it('paginates canonical direct story representatives without duplicates or gaps', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const newest = new Date(Date.now() + 5 * 60_000)
    const at = (secondsAgo: number) => new Date(newest.getTime() - secondsAgo * 1000)
    const itemA = await createTestRssFeedItemWithUrl(feedId, { createdAt: at(0) })
    const itemB = await createTestRssFeedItemWithUrl(feedId, { createdAt: at(1) })
    const itemC = await createTestRssFeedItemWithUrl(feedId, { createdAt: at(2) })
    const itemD = await createTestRssFeedItemWithUrl(feedId, { createdAt: at(3) })
    const itemE = await createTestRssFeedItemWithUrl(feedId, { createdAt: at(4) })
    const story = await insertTestStory({ officialRssFeedItemId: itemB.id })
    await Promise.all([
      setTestItemStoryId(itemB.id, story.id),
      setTestItemStoryId(itemC.id, story.id),
      setTestItemStoryId(itemD.id, story.id),
    ])

    const fullPage = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 3 })
    expect(fullPage.results.map(result => result.entity_id)).toEqual([itemA.id, itemB.id, itemE.id])
    expect(fullPage.page_info.has_next_page).toBe(false)

    const page1 = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 2 })
    expect(page1.results.map(result => result.entity_id)).toEqual([itemA.id, itemB.id])
    expect(page1.page_info.has_next_page).toBe(true)
    const page2 = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 2,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results.map(result => result.entity_id)).toEqual([itemE.id])
    expect(page2.page_info.has_next_page).toBe(false)
  })

  it('selects an eligible sibling when the story official item is filtered out', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const officialItem = await createTestRssFeedItemWithUrl(feedId)
    const eligibleSibling = await createTestRssFeedItemWithUrl(feedId)
    const story = await insertTestStory({ officialRssFeedItemId: officialItem.id })
    await Promise.all([
      setTestItemStoryId(officialItem.id, story.id),
      setTestItemStoryId(eligibleSibling.id, story.id),
      setRssFeedItemMediaType(officialItem.id, 'audio'),
    ])

    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 10,
      media_types: ['article'],
    })
    expect(result.results.map(item => item.entity_id)).toContain(eligibleSibling.id)
    expect(result.results.map(item => item.entity_id)).not.toContain(officialItem.id)
  })
})
