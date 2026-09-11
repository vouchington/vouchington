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
  it('pagination remains stable when multiple items share the same published_at', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const sharedIsoDate = new Date('2020-01-01T00:00:00.000Z').toISOString()
    const embedding = new Array(1024).fill(0.01)

    const createItemWithSharedSortTs = async (guid: string) => {
      const url = await addUrl(null, `https://example.com/${guid}`, { content_type: 'text/html' })
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: url!.id,
        guid,
        itemData: { title: guid, isoDate: sharedIsoDate },
        contentSha256: createHash('sha256').update(`${guid}-sha`).digest(),
        embeddingSha256: createHash('sha256').update(`${guid}-embedding`).digest(),
        embedding,
        tokens: 10,
      })
      // RSS feed items are cascade-deleted when feed is deleted
      return itemId
    }

    await createItemWithSharedSortTs(`shared-a-${Math.random().toString(36).slice(2, 10)}`)
    await createItemWithSharedSortTs(`shared-b-${Math.random().toString(36).slice(2, 10)}`)
    await createItemWithSharedSortTs(`shared-c-${Math.random().toString(36).slice(2, 10)}`)

    const page1 = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 2,
    })
    const cursor = page1.page_info.end_cursor
    expect(cursor).toBeDefined()

    if (!cursor) {
      throw new Error('expected end_cursor')
    }

    const page2 = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      after: cursor,
      limit: 2,
    })

    const allIds = [...page1.results, ...page2.results].map(row => row.id)
    expect(new Set(allIds).size).toBe(allIds.length)
    expect(allIds.length).toBeGreaterThanOrEqual(3)
  })

  it('includes results with proper structure', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)

    await followRssFeed(user, feedId)

    const item = await createTestRssFeedItemWithUrl(feedId)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 10 })

    const foundItem = result.results.find(r => r.id === item.id)
    expect(foundItem).toBeDefined()
    expect(foundItem?.id).toBe(item.id)
  })

  it('sorts by published_at DESC', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)

    await followRssFeed(user, feedId)

    // Create items with specific publish dates to control sort order
    const now = Date.now()

    const createItemWithDate = async (offsetMs: number) => {
      const random = Math.random().toString(36).slice(2, 15)
      const urlObj = await addUrl(null, `https://example.com/${random}`, {
        content_type: 'text/html',
      })
      const contentSha256 = createHash('sha256').update(random).digest()
      const isoDate = new Date(now + offsetMs).toISOString()
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: urlObj!.id,
        guid: `guid-${random}`,
        itemData: { title: `Test Item ${random}`, isoDate },
        contentSha256,
      })
      // RSS feed items are cascade-deleted when feed is deleted
      return itemId
    }

    // Create 3 items with different timestamps (oldest to newest offsets)
    const item1 = await createItemWithDate(-3000) // Oldest
    const item2 = await createItemWithDate(-2000)
    const item3 = await createItemWithDate(-1000) // Newest

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds' })

    expect(result.results.length).toBe(3)
    // Should be sorted DESC (newest first)
    expect(result.results[0].id).toBe(item3)
    expect(result.results[1].id).toBe(item2)
    expect(result.results[2].id).toBe(item1)
  })

  it('rejects invalid cursor', async () => {
    const user = await createTestUser()
    await expect(
      getRssFeedItemFeedIds(user, {
        feed_type: 'any',
        after: 'invalid-base64-cursor',
      }),
    ).rejects.toThrow('Invalid cursor')
  })

  it('returns shared RSS items in the friends feed without clustering them', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)

    await followUser(follower, sharer)
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, item.id)).distribution_id,
    )

    const result = await getRssFeedItemFeedIds(follower, { feed_type: 'follow_users', limit: 10 })
    const sharedItem = result.results.find(
      row => row.entity_id === item.id && row.delivery_type === 'share',
    )

    expect(sharedItem).toBeDefined()
    expect(sharedItem?.shared_by_user_id).toBe(sharer.id)
    expect(sharedItem?.story_id).toBeNull()
  })

  it('excludes shared items with alias-only categories linked to muted topics', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const topic = await createTestTopic()
    const mutedTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const aliasId = await createTopHashtagAliasForTest(
      mutedTopic.id,
      `muted-shared-rss-alias-${item.id}`,
    )

    await followUser(follower, sharer)
    await muteTopic(follower, mutedTopic)
    await createTopHashtagRssSourceForTest({
      rssFeedItemId: item.id,
      topicAliasId: aliasId,
      authoredToken: `#muted-shared-rss-alias-${item.id}`,
    })
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, item.id)).distribution_id,
    )

    const result = await getRssFeedItemFeedIds(follower, {
      feed_type: 'follow_users',
      limit: 10,
    })

    expect(result.results.some(row => row.entity_id === item.id)).toBe(false)
  })

  it('direct items have UUID id and entity_id (not composite rss_feed_id:guid)', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)
    const item = await createTestRssFeedItemWithUrl(feedId)

    const result = await getRssFeedItemFeedIds(user, { feed_type: 'follow_rss_feeds', limit: 10 })
    const found = result.results.find(r => r.id === item.id)

    expect(found).toBeDefined()
    // id and entity_id must be UUIDv7, not rss_feed_id:guid composite
    expect(found?.id).toBe(item.id)
    expect(found?.entity_id).toBe(item.id)
    expect(found?.id).not.toContain(':')
    expect(found?.entity_id).not.toContain(':')
  })

  it('shared items have UUID entity_id matching the rss feed item id', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)

    await followUser(follower, sharer)
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, item.id)).distribution_id,
    )

    const result = await getRssFeedItemFeedIds(follower, { feed_type: 'follow_users', limit: 10 })
    const sharedItem = result.results.find(
      row => row.delivery_type === 'share' && row.entity_id === item.id,
    )

    expect(sharedItem).toBeDefined()
    // entity_id must be the UUIDv7 of the rss feed item, not composite
    expect(sharedItem?.entity_id).toBe(item.id)
    expect(sharedItem?.entity_id).not.toContain(':')
    // result id is the share event UUID (different from item UUID)
    expect(sharedItem?.id).not.toBe(item.id)
    expect(sharedItem?.id).not.toContain(':')
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof addCategoryToRssFeedItem)
  void (0 as unknown as typeof followTopic)
  void (0 as unknown as typeof muteRssFeed)
  void (0 as unknown as typeof muteTopic)
  void (0 as unknown as typeof hideRssFeedItem)
})
