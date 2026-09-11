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
} from '@voucha/test-helpers'

describe('getRssFeedItemFeedIds dedup pagination', () => {
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
