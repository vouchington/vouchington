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
} from '@voucha/test-helpers'
import { updateRssFeedById } from '@services/rss-feeds'
import {
  processFollowerDistributionChunk,
  shareRssFeedItemWithFollowers,
} from '@services/follower-distributions'

describe('getRssFeedItemFeedIds', () => {
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
