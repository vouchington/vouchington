import { it, expect, describe } from 'vitest'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import {
  addCategoryToRssFeedItem,
  followRssFeed,
  followUser,
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestProxyFollowCommunity,
  insertTestProxyMuteCommunity,
  setRssFeedOwningTopicVoteScore,
  insertTestStory,
  setTestItemStoryId,
  setRssFeedItemShareSortAtForTest,
} from '@voucha/test-helpers'
import { updateRssFeedById } from '@services/rss-feeds'
import { processFollowerDistributionChunk } from '@services/follower-distributions'
import { shareRssFeedItemWithFollowers } from '../../share-actions.mts'

describe('getRssFeedItemFeedIds', () => {
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
    const directItem = await createTestRssFeedItemWithUrl(feedId, { createdAt: tiedAt })
    const sharedItem = await createTestRssFeedItemWithUrl(feedId, { createdAt: tiedAt })
    const story = await insertTestStory({ officialRssFeedItemId: directItem.id })
    await Promise.all([
      setTestItemStoryId(directItem.id, story.id),
      setTestItemStoryId(sharedItem.id, story.id),
    ])
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, sharedItem.id)).distribution_id,
    )
    await setRssFeedItemShareSortAtForTest({
      recipientUserId: follower.id,
      rssFeedItemId: sharedItem.id,
      sharedByUserId: sharer.id,
      sortAt: tiedAt,
    })

    const page1 = await getRssFeedItemFeedIds(follower, { feed_type: 'any', limit: 1 })
    expect(page1.results).toMatchObject([{ entity_id: sharedItem.id, delivery_type: 'share' }])
    expect(page1.page_info.has_next_page).toBe(true)

    const page2 = await getRssFeedItemFeedIds(follower, {
      feed_type: 'any',
      after: page1.page_info.end_cursor!,
      limit: 1,
    })
    expect(page2.results).toMatchObject([{ entity_id: directItem.id, delivery_type: 'direct' }])
    expect(page2.page_info.has_next_page).toBe(false)
  })

  it('includes items from RSS feeds in a proxy_follow community list', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
    })
    await insertTestProxyFollowCommunity(user.id, community.id)

    const item = await createTestRssFeedItemWithUrl(feedId)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 100 })

    expect(result.results.some(r => r.id === item.id)).toBe(true)
  })

  it('scopes signed-out RSS items to feeds in the selected community list', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const topic = await createTestTopic()
    const otherTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const otherFeedId = await createTestRssFeedWithTiming(otherTopic.id)
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
    })

    const item = await createTestRssFeedItemWithUrl(feedId)
    const unrelatedItem = await createTestRssFeedItemWithUrl(otherFeedId)

    const result = await getRssFeedItemFeedIds(null, {
      community_id: community.id,
      feed_type: 'any',
      limit: 100,
    })

    expect(result.results.some(r => r.id === item.id)).toBe(true)
    expect(result.results.some(r => r.id === unrelatedItem.id)).toBe(false)
  })

  it('scopes RSS items to topics in the selected community list', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const communityTopic = await createTestTopic()
    const feedTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'topic',
      entityId: communityTopic.id,
    })

    const item = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(item.id, communityTopic.id)

    const result = await getRssFeedItemFeedIds(user, {
      community_id: community.id,
      feed_type: 'follow_topics',
      limit: 100,
    })

    expect(result.results.some(r => r.id === item.id)).toBe(true)
  })

  it('excludes shared RSS feed deliveries from community-scoped feeds', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
    })
    await followUser(follower, sharer)

    const item = await createTestRssFeedItemWithUrl(feedId)
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, item.id)).distribution_id,
    )

    const result = await getRssFeedItemFeedIds(follower, {
      community_id: community.id,
      feed_type: 'any',
      limit: 100,
    })

    expect(result.results.some(r => r.id === item.id && r.delivery_type === 'direct')).toBe(true)
    expect(result.results.some(r => r.entity_id === item.id && r.delivery_type === 'share')).toBe(
      false,
    )
  })

  it('excludes items from RSS feeds in a proxy_mute community list', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
    })
    await insertTestProxyMuteCommunity(user.id, community.id)

    const item = await createTestRssFeedItemWithUrl(feedId)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 100 })

    expect(result.results.some(r => r.id === item.id)).toBe(false)
  })

  it('includes items with topics from a proxy_follow community list', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const topic = await createTestTopic()
    const feedTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'topic',
      entityId: topic.id,
    })
    await insertTestProxyFollowCommunity(user.id, community.id)

    const item = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(item.id, topic.id)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_topics', limit: 100 })

    expect(result.results.some(r => r.id === item.id)).toBe(true)
  })

  it('excludes items with topics from a proxy_mute community list', async () => {
    const user = await createTestUser()
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const topic = await createTestTopic()
    const feedTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    await followRssFeed(user, feedId)
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'topic',
      entityId: topic.id,
    })
    await insertTestProxyMuteCommunity(user.id, community.id)

    const item = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(item.id, topic.id)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'any', limit: 100 })

    expect(result.results.some(r => r.id === item.id)).toBe(false)
  })

  it('hidden feed still shows items in personal feed', async () => {
    const user = await createTestUser()
    const feedTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    await followRssFeed(user, feedId)

    const item = await createTestRssFeedItemWithUrl(feedId)

    await updateRssFeedById(feedId, { discoverable: false })

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'any', limit: 100 })

    expect(result.results.some(r => r.id === item.id)).toBe(true)
  })

  it('topic score below global threshold still shows items in personal feed', async () => {
    const user = await createTestUser()
    const feedTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    await followRssFeed(user, feedId)

    const item = await createTestRssFeedItemWithUrl(feedId)

    // Score net = -1 < 0 (global threshold) — should NOT suppress in personal feed
    await setRssFeedOwningTopicVoteScore(feedId, 0, 1)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'any', limit: 100 })

    expect(result.results.some(r => r.id === item.id)).toBe(true)
  })
})
