import { it, expect, describe } from 'vitest'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import {
  addRssFeedItemSource,
  addCategoryToRssFeedItem,
  followRssFeed,
  followTopic,
  followUser,
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import { setRssFeedEnablementAsSystem } from '@services/rss-feeds/discoverability'
import { softDeleteRssFeedById } from '@services/rss-feeds/delete'
import { processFollowerDistributionChunk } from '@services/follower-distributions'
import { shareRssFeedItemWithFollowers } from '../../share-actions.mts'

describe('getRssFeedItemFeedIds enabled-feed filtering', () => {
  it('excludes items from disabled feed in direct feed', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const item = await createTestRssFeedItemWithUrl(feedId)

    // Disable the feed (overrideHumanLock so we can toggle from the system auto-updater state)
    await setRssFeedEnablementAsSystem({
      rssFeedId: feedId,
      enabled: false,
      overrideHumanLock: true,
    })

    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
    })

    const found = result.results.find(r => r.entity_id === item.id)
    expect(found).toBeUndefined()
  }, 60_000)

  it('includes items from re-enabled feed after re-enable', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const item = await createTestRssFeedItemWithUrl(feedId)

    // Disable then re-enable
    await setRssFeedEnablementAsSystem({
      rssFeedId: feedId,
      enabled: false,
      overrideHumanLock: true,
    })
    await setRssFeedEnablementAsSystem({
      rssFeedId: feedId,
      enabled: true,
      overrideHumanLock: true,
    })

    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
    })

    const found = result.results.find(r => r.entity_id === item.id)
    expect(found).toBeDefined()
  }, 60_000)

  it('excludes items from disabled feed even when they match a followed topic', async () => {
    const user = await createTestUser()
    const feedTopic = await createTestTopic()
    const categoryTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    await followTopic(user, categoryTopic)

    const item = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(item.id, categoryTopic.id)

    // Disable the feed — items from disabled feeds must be excluded from all delivery paths
    await setRssFeedEnablementAsSystem({
      rssFeedId: feedId,
      enabled: false,
      overrideHumanLock: true,
    })

    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_topics',
      limit: 100,
    })

    const found = result.results.find(r => r.entity_id === item.id)
    expect(found).toBeUndefined()
  }, 60_000)

  it('excludes items from direct feed when votes_score_net is below min_score_follow_rss_feeds', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const item = await createTestRssFeedItemWithUrl(feedId)

    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
      // Default min_score_follow_rss_feeds = -5; newly created items start at 0, so they pass.
      // Use a threshold above 0 to ensure the item is excluded.
      min_score_follow_rss_feeds: 10,
    })

    const found = result.results.find(r => r.entity_id === item.id)
    expect(found).toBeUndefined()
  }, 60_000)

  it('includes items from followed topics when votes_score_net meets min_score_follow_topics', async () => {
    const user = await createTestUser()
    const feedTopic = await createTestTopic()
    const categoryTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    await followTopic(user, categoryTopic)

    const item = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(item.id, categoryTopic.id)

    // Default min_score_follow_topics = 0; newly created items start at 0, so they pass.
    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_topics',
      limit: 100,
      min_score_follow_topics: 0,
    })

    const found = result.results.find(r => r.entity_id === item.id)
    expect(found).toBeDefined()
  }, 60_000)

  it('excludes disabled matching sources from direct and shared topic-filtered feeds', async () => {
    const recipient = await createTestUser()
    const sharer = await createTestUser()
    const unrelatedTopic = await createTestTopic()
    const matchingTopic = await createTestTopic()
    const unrelatedFeedId = await createTestRssFeedWithTiming(unrelatedTopic.id)
    const matchingFeedId = await createTestRssFeedWithTiming(matchingTopic.id)
    await followRssFeed(recipient, unrelatedFeedId)
    await followUser(recipient, sharer)

    const item = await createTestRssFeedItemWithUrl(unrelatedFeedId)
    await addRssFeedItemSource(matchingFeedId, item.id)
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, item.id)).distribution_id,
    )
    await setRssFeedEnablementAsSystem({
      rssFeedId: matchingFeedId,
      enabled: false,
      overrideHumanLock: true,
    })

    const direct = await getRssFeedItemFeedIds(recipient, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
      topic_ids: [matchingTopic.id],
    })
    const shared = await getRssFeedItemFeedIds(recipient, {
      feed_type: 'follow_users',
      limit: 100,
      topic_ids: [matchingTopic.id],
    })

    expect(direct.results.map(result => result.entity_id)).not.toContain(item.id)
    expect(shared.results.map(result => result.entity_id)).not.toContain(item.id)

    await setRssFeedEnablementAsSystem({
      rssFeedId: matchingFeedId,
      enabled: true,
      overrideHumanLock: true,
    })

    const enabledDirect = await getRssFeedItemFeedIds(recipient, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
      topic_ids: [matchingTopic.id],
    })
    const enabledShared = await getRssFeedItemFeedIds(recipient, {
      feed_type: 'follow_users',
      limit: 100,
      topic_ids: [matchingTopic.id],
    })

    expect(enabledDirect.results.map(result => result.entity_id)).toContain(item.id)
    expect(enabledShared.results.map(result => result.entity_id)).toContain(item.id)
  }, 60_000)

  it('excludes deleted matching sources from direct and shared topic-filtered feeds', async () => {
    const recipient = await createTestUser()
    const sharer = await createTestUser()
    const unrelatedTopic = await createTestTopic()
    const matchingTopic = await createTestTopic()
    const unrelatedFeedId = await createTestRssFeedWithTiming(unrelatedTopic.id)
    const matchingFeedId = await createTestRssFeedWithTiming(matchingTopic.id)
    await followRssFeed(recipient, unrelatedFeedId)
    await followUser(recipient, sharer)

    const item = await createTestRssFeedItemWithUrl(unrelatedFeedId)
    await addRssFeedItemSource(matchingFeedId, item.id)
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, item.id)).distribution_id,
    )
    await softDeleteRssFeedById(matchingFeedId)

    const direct = await getRssFeedItemFeedIds(recipient, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
      topic_ids: [matchingTopic.id],
    })
    const shared = await getRssFeedItemFeedIds(recipient, {
      feed_type: 'follow_users',
      limit: 100,
      topic_ids: [matchingTopic.id],
    })

    expect(direct.results.map(result => result.entity_id)).not.toContain(item.id)
    expect(shared.results.map(result => result.entity_id)).not.toContain(item.id)
  }, 60_000)
})
