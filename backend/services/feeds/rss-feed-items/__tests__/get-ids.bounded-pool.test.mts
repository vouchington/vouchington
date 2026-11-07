import { describe, expect, it } from 'vitest'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import {
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  followTopic,
  followUser,
  addCategoryToRssFeedItem,
  setRssFeedItemShareSortAtForTest,
  insertTestStory,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import {
  processFollowerDistributionChunk,
  shareRssFeedItemWithFollowers,
} from '@services/follower-distributions'

const DAY_MS = 24 * 60 * 60 * 1000

describe('personalized RSS feed source union and horizon', () => {
  it('returns source-only and topic-only matches, and returns a match from both once', async () => {
    const viewer = await createTestUser()
    const sourceTopic = await createTestTopic()
    const topicOnlyFeedTopic = await createTestTopic()
    const followedTopic = await createTestTopic()
    const sourceFeed = await createTestRssFeedWithTiming(sourceTopic.id)
    const topicFeed = await createTestRssFeedWithTiming(topicOnlyFeedTopic.id)
    const bothFeed = await createTestRssFeedWithTiming(followedTopic.id)
    await Promise.all([
      followRssFeed(viewer, sourceFeed),
      followTopic(viewer, followedTopic),
      followRssFeed(viewer, bothFeed),
    ])
    const [sourceOnly, topicOnly, both] = await Promise.all([
      createTestRssFeedItemWithUrl(sourceFeed),
      createTestRssFeedItemWithUrl(topicFeed),
      createTestRssFeedItemWithUrl(bothFeed),
    ])
    await Promise.all([
      addCategoryToRssFeedItem(topicOnly.id, followedTopic.id),
      addCategoryToRssFeedItem(both.id, followedTopic.id),
    ])

    const { result: page, queries } = await withCapturedTestQueries(() =>
      getRssFeedItemFeedIds(viewer, { feed_type: 'all', limit: 10 }),
    )
    expect(
      queries.filter(query => query.text.includes('/* getRssFeedItemFeedIds */')),
    ).toHaveLength(1)
    expect(page.results.map(row => row.entity_id).toSorted()).toEqual(
      [sourceOnly.id, topicOnly.id, both.id].toSorted(),
    )
    expect(page.results).toHaveLength(3)
    expect(page.page_info.has_next_page).toBe(false)
  })

  it('returns the story representative once across a page boundary and never emits older members', async () => {
    const viewer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(viewer, feedId)
    const now = Date.now()
    const at = (secondsAgo: number) => new Date(now - secondsAgo * 1000)
    const first = await createTestRssFeedItemWithUrl(feedId, { createdAt: at(1) })
    const storyNewest = await createTestRssFeedItemWithUrl(feedId, { createdAt: at(2) })
    const storyOlder = await createTestRssFeedItemWithUrl(feedId, { createdAt: at(3) })
    const last = await createTestRssFeedItemWithUrl(feedId, { createdAt: at(4) })
    const story = await insertTestStory({
      officialRssFeedItemId: storyOlder.id,
    })
    await Promise.all([
      setTestItemStoryId(storyNewest.id, story.id),
      setTestItemStoryId(storyOlder.id, story.id),
    ])

    const firstPage = await getRssFeedItemFeedIds(viewer, {
      feed_type: 'follow_rss_feeds',
      limit: 1,
    })
    expect(firstPage.results.map(row => row.entity_id)).toEqual([first.id])
    expect(firstPage.page_info.has_next_page).toBe(true)
    const secondPage = await getRssFeedItemFeedIds(viewer, {
      feed_type: 'follow_rss_feeds',
      limit: 1,
      after: firstPage.page_info.end_cursor!,
    })
    expect(secondPage.results.map(row => row.entity_id)).toEqual([storyNewest.id])
    expect(secondPage.page_info.has_next_page).toBe(true)
    const thirdPage = await getRssFeedItemFeedIds(viewer, {
      feed_type: 'follow_rss_feeds',
      limit: 1,
      after: secondPage.page_info.end_cursor!,
    })
    expect(thirdPage.results.map(row => row.entity_id)).toEqual([last.id])
    expect(thirdPage.results.map(row => row.entity_id)).not.toContain(storyOlder.id)
    expect(thirdPage.page_info.has_next_page).toBe(false)
  })

  it('clamps all longer ranges to seven days, including a recently delivered old item', async () => {
    const viewer = await createTestUser()
    const sharer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await Promise.all([followRssFeed(viewer, feedId), followUser(viewer, sharer)])
    const recent = await createTestRssFeedItemWithUrl(feedId, {
      createdAt: new Date(Date.now() - 2 * DAY_MS),
    })
    const old = await createTestRssFeedItemWithUrl(feedId, {
      createdAt: new Date(Date.now() - 8 * DAY_MS),
    })
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, old.id)).distribution_id,
    )
    await setRssFeedItemShareSortAtForTest({
      recipientUserId: viewer.id,
      rssFeedItemId: old.id,
      sharedByUserId: sharer.id,
      sortAt: new Date(),
    })

    for (const time_range of ['1m', '1y', 'all'] as const) {
      const page = await getRssFeedItemFeedIds(viewer, { feed_type: 'any', time_range, limit: 10 })
      expect(page.results.map(row => [row.entity_id, row.delivery_type])).toEqual([
        [recent.id, 'direct'],
      ])
      expect(page.page_info.has_next_page).toBe(false)
    }
  })
})
