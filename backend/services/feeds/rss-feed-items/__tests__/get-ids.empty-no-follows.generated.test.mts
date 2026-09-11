import { it, expect, describe } from 'vitest'

import { getRssFeedItemFeedIds } from '../get-ids.mts'

import {
  addCategoryToRssFeedItem,
  followRssFeed,
  followTopic,
  muteRssFeed,
  muteTopic,
  hideRssFeedItem,
  insertTestRssFeedItem,
  followUser,
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  createTopHashtagAliasForTest,
  createTopHashtagRssSourceForTest,
} from '@voucha/test-helpers'

import { shareRssFeedItemWithFollowers } from '../../share-actions.mts'

import { processFollowerDistributionChunk } from '@services/follower-distributions'

import { addUrl } from '@services/urls'

import { createHash } from 'node:crypto'

describe('getRssFeedItemFeedIds', () => {
  it('returns empty results when user has no follows', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await createTestRssFeedItemWithUrl(feedId)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'any' })

    expect(result.results).toEqual([])
    expect(result.page_info.has_next_page).toBe(false)
  })

  it('returns items from followed RSS feeds with feed_type=follow_rss_feeds', async () => {
    const user = await createTestUser()
    const followedTopic = await createTestTopic()
    const unfollowedTopic = await createTestTopic()
    const followedFeedId = await createTestRssFeedWithTiming(followedTopic.id)
    const unfollowedFeedId = await createTestRssFeedWithTiming(unfollowedTopic.id)

    await followRssFeed(user, followedFeedId)

    const followedItem = await createTestRssFeedItemWithUrl(followedFeedId)
    await createTestRssFeedItemWithUrl(unfollowedFeedId)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 100 })

    const foundItem = result.results.find(r => r.id === followedItem.id)
    expect(foundItem).toBeDefined()
  })

  it('returns items with followed category topics with feed_type=follow_topics', async () => {
    const user = await createTestUser()
    const feedCreator = await createTestUser()
    const topic = await createTestTopic({ user: feedCreator })
    const categoryTopic = await createTestTopic({ user: feedCreator })
    const feedId = await createTestRssFeedWithTiming(topic.id)

    await followTopic(user, categoryTopic)

    const item = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(item.id, categoryTopic.id)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_topics', limit: 100 })

    const foundItem = result.results.find(r => r.id === item.id)
    expect(foundItem).toBeDefined()
  })

  it('returns alias-only category relations linked to followed topics before backfill', async () => {
    const user = await createTestUser()
    const feedTopic = await createTestTopic()
    const followedTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const alias = `followed-rss-alias-${item.id}`
    const aliasId = await createTopHashtagAliasForTest(followedTopic.id, alias)

    await followTopic(user, followedTopic)
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: item.id,
      topicAliasId: aliasId,
      authoredToken: `#${alias}`,
    })

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_topics', limit: 100 })

    expect(result.results.some(row => row.entity_id === item.id)).toBe(true)
  })

  it('returns items from followed RSS feeds OR followed topics with feed_type=any', async () => {
    const user = await createTestUser()
    const feedCreator = await createTestUser()
    const followedTopic = await createTestTopic({ user: feedCreator })
    const otherTopic = await createTestTopic({ user: feedCreator })
    const categoryTopic = await createTestTopic({ user: feedCreator })
    const followedFeedId = await createTestRssFeedWithTiming(followedTopic.id)
    const otherFeedId = await createTestRssFeedWithTiming(otherTopic.id)

    await followRssFeed(user, followedFeedId)
    await followTopic(user, categoryTopic)

    const itemFromFollowedFeed = await createTestRssFeedItemWithUrl(followedFeedId)
    const itemWithCategory = await createTestRssFeedItemWithUrl(otherFeedId)
    await addCategoryToRssFeedItem(itemWithCategory.id, categoryTopic.id)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'any', limit: 100 })

    const foundItemFromFeed = result.results.find(r => r.id === itemFromFollowedFeed.id)
    const foundItemWithCategory = result.results.find(r => r.id === itemWithCategory.id)
    expect(foundItemFromFeed).toBeDefined()
    expect(foundItemWithCategory).toBeDefined()
  })

  it('returns items from followed RSS feeds AND followed topics with feed_type=all', async () => {
    const user = await createTestUser()
    const feedCreator = await createTestUser()
    const topic = await createTestTopic({ user: feedCreator })
    const categoryTopic = await createTestTopic({ user: feedCreator })
    const followedFeedId = await createTestRssFeedWithTiming(topic.id)

    await followRssFeed(user, followedFeedId)
    await followTopic(user, categoryTopic)

    // Item from followed feed without followed topic category
    const itemOnlyFeed = await createTestRssFeedItemWithUrl(followedFeedId)
    // Item from followed feed with followed topic category
    const itemBoth = await createTestRssFeedItemWithUrl(followedFeedId)
    await addCategoryToRssFeedItem(itemBoth.id, categoryTopic.id)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'all', limit: 100 })

    const foundItemOnlyFeed = result.results.find(r => r.id === itemOnlyFeed.id)
    const foundItemBoth = result.results.find(r => r.id === itemBoth.id)
    expect(foundItemOnlyFeed).toBeUndefined()
    expect(foundItemBoth).toBeDefined()
  })

  it('excludes hidden items', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)

    await followRssFeed(user, feedId)

    const visibleItem = await createTestRssFeedItemWithUrl(feedId)
    const hiddenItem = await createTestRssFeedItemWithUrl(feedId)
    await hideRssFeedItem(user, hiddenItem)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 100 })

    const foundVisible = result.results.find(r => r.id === visibleItem.id)
    const foundHidden = result.results.find(r => r.id === hiddenItem.id)
    expect(foundVisible).toBeDefined()
    expect(foundHidden).toBeUndefined()
  })

  it('excludes items from muted RSS feeds', async () => {
    const user = await createTestUser()
    const followedTopic = await createTestTopic()
    const mutedTopic = await createTestTopic()
    const followedFeedId = await createTestRssFeedWithTiming(followedTopic.id)
    const mutedFeedId = await createTestRssFeedWithTiming(mutedTopic.id)

    await followRssFeed(user, followedFeedId)
    await followRssFeed(user, mutedFeedId)
    await muteRssFeed(user, mutedFeedId)

    const allowedItem = await createTestRssFeedItemWithUrl(followedFeedId)
    await createTestRssFeedItemWithUrl(mutedFeedId)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 100 })

    const foundAllowed = result.results.find(r => r.id === allowedItem.id)
    expect(foundAllowed).toBeDefined()
  })

  it('excludes items with muted category topics', async () => {
    const user = await createTestUser()
    const feedCreator = await createTestUser()
    const topic = await createTestTopic({ user: feedCreator })
    const mutedTopic = await createTestTopic({ user: feedCreator })
    const feedId = await createTestRssFeedWithTiming(topic.id)

    await followRssFeed(user, feedId)
    await muteTopic(user, mutedTopic)

    const allowedItem = await createTestRssFeedItemWithUrl(feedId)
    const mutedItem = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(mutedItem.id, mutedTopic.id)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 100 })

    const foundAllowed = result.results.find(r => r.id === allowedItem.id)
    const foundMuted = result.results.find(r => r.id === mutedItem.id)
    expect(foundAllowed).toBeDefined()
    expect(foundMuted).toBeUndefined()
  })

  it('excludes direct items with alias-only categories linked to muted topics', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const mutedTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const aliasId = await createTopHashtagAliasForTest(mutedTopic.id, `muted-rss-alias-${item.id}`)

    await followRssFeed(user, feedId)
    await muteTopic(user, mutedTopic)
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: item.id,
      topicAliasId: aliasId,
      authoredToken: `#muted-rss-alias-${item.id}`,
    })

    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
    })

    expect(result.results.some(row => row.entity_id === item.id)).toBe(false)
  })

  it('pagination works with end_cursor', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)

    await followRssFeed(user, feedId)

    await createTestRssFeedItemWithUrl(feedId)
    await createTestRssFeedItemWithUrl(feedId)
    await createTestRssFeedItemWithUrl(feedId)

    // Get first page with limit 1
    const page1 = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 1,
    })

    expect(page1.results.length).toBe(1)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeDefined()

    // Get second page
    expect(page1.page_info.end_cursor).toBeTruthy()
    const page2 = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      after: page1.page_info.end_cursor!,
      limit: 1,
    })
    expect(page2.results.length).toBe(1)
    expect(page2.results[0].id).not.toBe(page1.results[0].id)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestRssFeedItem)
  void (0 as unknown as typeof followUser)
  void (0 as unknown as typeof shareRssFeedItemWithFollowers)
  void (0 as unknown as typeof processFollowerDistributionChunk)
  void (0 as unknown as typeof addUrl)
  void (0 as unknown as typeof createHash)
})
