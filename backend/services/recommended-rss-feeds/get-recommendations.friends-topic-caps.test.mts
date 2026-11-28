import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertEntityRelation,
  insertTestLocalFollow,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getRecommendedRssFeeds } from './get-recommendations.mts'
import { recommendedRssFeedsWorkConfig } from './work-limits.mts'

const FOLLOW_RSS_FEED = 'relation__user__follow__rss_feed'
const FOLLOW_TOPIC = 'relation__user__follow__topic'

describe('friends and topic RSS recommendation caps', () => {
  it('preserves exact feeds, scores, reasons, and cursor pagination below the caps', async () => {
    const [viewer, friendA, friendB] = await createUsers(3)
    const [sharedFriendTopic, friendAndTopicTopic, friendOnlyTopic, topicOnlyTopic] =
      await createTopicsWithFeeds(4)

    await insertTestLocalFollow(viewer.id, friendA.id)
    await insertTestLocalFollow(viewer.id, friendB.id)
    await insertEntityRelation(FOLLOW_TOPIC, viewer.id, friendAndTopicTopic.topicId)
    await insertEntityRelation(FOLLOW_TOPIC, viewer.id, topicOnlyTopic.topicId)

    // sharedFriendTopic.feedId: followed by 2 friends -> 6.0 ['friends']
    await followFeed(friendA.id, sharedFriendTopic.feedId)
    await followFeed(friendB.id, sharedFriendTopic.feedId)
    // friendAndTopicTopic.feedId: followed by 1 friend + 1 topic -> 5.5 ['friends', 'topic']
    await followFeed(friendA.id, friendAndTopicTopic.feedId)
    // friendOnlyTopic.feedId: followed by 1 friend -> 3.0 ['friends']
    await followFeed(friendB.id, friendOnlyTopic.feedId)
    // topicOnlyTopic.feedId: followed topic only -> 2.5 ['topic']

    const expectedOrder = [
      { id: sharedFriendTopic.feedId, score: 6, reasons: ['friends'] },
      { id: friendAndTopicTopic.feedId, score: 5.5, reasons: ['friends', 'topic'] },
      { id: friendOnlyTopic.feedId, score: 3, reasons: ['friends'] },
      { id: topicOnlyTopic.feedId, score: 2.5, reasons: ['topic'] },
    ]

    const full = await getRecommendedRssFeeds(viewer.id, { limit: 10, source: 'all' })
    expect(
      full.results.map(r => ({
        id: r.id,
        score: r.recommendation_score,
        reasons: r.recommendation_reasons.toSorted(),
      })),
    ).toEqual(expectedOrder)
    expect(full.page_info.has_next_page).toBe(false)

    // Page through with limit 2 and confirm identical order and scores across pages
    const page1 = await getRecommendedRssFeeds(viewer.id, { limit: 2, source: 'all' })
    expect(page1.page_info.has_next_page).toBe(true)
    const page2 = await getRecommendedRssFeeds(viewer.id, {
      limit: 2,
      after: page1.page_info.end_cursor!,
      source: 'all',
    })
    expect(page2.page_info.has_next_page).toBe(false)
    expect(
      [...page1.results, ...page2.results].map(r => ({
        id: r.id,
        score: r.recommendation_score,
        reasons: r.recommendation_reasons.toSorted(),
      })),
    ).toEqual(expectedOrder)
  })

  it('seeds friend recommendations only from the newest accounts the viewer follows', async () => {
    const [viewer, olderFriend, newerFriend] = await createUsers(3)
    const [olderItem, newerItem] = await createTopicsWithFeeds(2)
    await insertTestLocalFollow(viewer.id, olderFriend.id)
    await insertTestLocalFollow(viewer.id, newerFriend.id)
    await followFeed(olderFriend.id, olderItem.feedId)
    await followFeed(newerFriend.id, newerItem.feedId)

    expect(await recommendedIds(viewer.id, 'friends')).toEqual(
      expect.arrayContaining([olderItem.feedId, newerItem.feedId]),
    )

    onTestFinished(
      overrideDynamicConfigFieldsForTest(recommendedRssFeedsWorkConfig, {
        friends_followed_user_limit: 1,
      }),
    )
    const ids = await recommendedIds(viewer.id, 'friends')
    expect(ids).toContain(newerItem.feedId)
    expect(ids).not.toContain(olderItem.feedId)
  })

  it("reads only each followed account's newest RSS feed follows", async () => {
    const [viewer, friend] = await createUsers(2)
    const [olderItem, newerItem] = await createTopicsWithFeeds(2)
    await insertTestLocalFollow(viewer.id, friend.id)
    await followFeed(friend.id, olderItem.feedId)
    await followFeed(friend.id, newerItem.feedId)

    expect(await recommendedIds(viewer.id, 'friends')).toEqual(
      expect.arrayContaining([olderItem.feedId, newerItem.feedId]),
    )

    onTestFinished(
      overrideDynamicConfigFieldsForTest(recommendedRssFeedsWorkConfig, {
        friends_user_feed_limit: 1,
      }),
    )
    const ids = await recommendedIds(viewer.id, 'friends')
    expect(ids).toContain(newerItem.feedId)
    expect(ids).not.toContain(olderItem.feedId)
  })

  it('seeds topic recommendations only from the newest topics the viewer follows', async () => {
    const [viewer] = await createUsers(1)
    const [olderItem, newerItem] = await createTopicsWithFeeds(2)
    await insertEntityRelation(FOLLOW_TOPIC, viewer.id, olderItem.topicId)
    await insertEntityRelation(FOLLOW_TOPIC, viewer.id, newerItem.topicId)

    expect(await recommendedIds(viewer.id, 'topic')).toEqual(
      expect.arrayContaining([olderItem.feedId, newerItem.feedId]),
    )

    onTestFinished(
      overrideDynamicConfigFieldsForTest(recommendedRssFeedsWorkConfig, {
        topic_followed_topic_limit: 1,
      }),
    )
    const ids = await recommendedIds(viewer.id, 'topic')
    expect(ids).toContain(newerItem.feedId)
    expect(ids).not.toContain(olderItem.feedId)
  })
})

async function recommendedIds(viewerId: string, source: 'friends' | 'topic'): Promise<string[]> {
  const { results } = await getRecommendedRssFeeds(viewerId, { limit: 100, source })
  return results.map(result => result.id)
}

async function createUsers(count: number) {
  return Promise.all(Array.from({ length: count }, () => createTestUser()))
}

async function createTopicsWithFeeds(
  count: number,
): Promise<Array<{ topicId: string; feedId: string }>> {
  const author = await createTestUser({ administrator: true })
  return Promise.all(
    Array.from({ length: count }, async () => {
      const suffix = crypto.randomUUID()
      const topicId = await insertTestTopic({
        name: `RSS friend/topic cap ${suffix}`,
        slug: `rss-ft-cap-${suffix}`,
        createdById: author.id,
      })
      const feedId = await insertTestRssFeed({
        topicId,
        title: `RSS friend/topic cap feed ${suffix}`,
      })
      return { topicId, feedId }
    }),
  )
}

async function followFeed(userId: string, feedId: string): Promise<void> {
  await insertEntityRelation(FOLLOW_RSS_FEED, userId, feedId)
}
