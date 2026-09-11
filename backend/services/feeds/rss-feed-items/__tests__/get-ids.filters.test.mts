import { it, expect, describe } from 'vitest'
import { createHash } from 'node:crypto'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import {
  addCategoryToRssFeedItem,
  followRssFeed,
  followUser,
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestRssFeedItem,
  setRssFeedItemMediaType,
} from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import { processFollowerDistributionChunk } from '@services/follower-distributions'
import { shareRssFeedItemWithFollowers } from '../../share-actions.mts'

describe('getRssFeedItemFeedIds filter branches', () => {
  it('media_types filter includes only items matching the requested media type', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const articleItem = await createTestRssFeedItemWithUrl(feedId)
    const audioItem = await createTestRssFeedItemWithUrl(feedId)
    await setRssFeedItemMediaType(audioItem.id, 'audio')

    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
      media_types: ['audio'],
    })

    const entityIds = result.results.map(r => r.entity_id)
    expect(entityIds).toContain(audioItem.id)
    expect(entityIds).not.toContain(articleItem.id)
  }, 60_000)

  it('text_search_query filter returns only items matching the query', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(user, feedId)

    const uniqueWord = `xyzunique${Math.random().toString(36).slice(2, 10)}`
    const random = Math.random().toString(36).slice(2, 15)
    const urlObj = await addUrl(null, `https://example.com/search-${random}`, {
      content_type: 'text/html',
    })
    const searchItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: urlObj!.id,
      guid: `guid-search-${uniqueWord}`,
      itemData: { title: `Article about ${uniqueWord}` },
      contentSha256: createHash('sha256').update(uniqueWord).digest(),
    })

    const otherItem = await createTestRssFeedItemWithUrl(feedId)

    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
      text_search_query: uniqueWord,
    })

    const entityIds = result.results.map(r => r.entity_id)
    expect(entityIds).toContain(searchItemId)
    expect(entityIds).not.toContain(otherItem.id)
  }, 60_000)

  it('topic_ids filter includes only items from feeds with matching topic', async () => {
    const user = await createTestUser()
    const topicA = await createTestTopic()
    const topicB = await createTestTopic()
    const feedA = await createTestRssFeedWithTiming(topicA.id)
    const feedB = await createTestRssFeedWithTiming(topicB.id)
    await followRssFeed(user, feedA)
    await followRssFeed(user, feedB)

    const itemA = await createTestRssFeedItemWithUrl(feedA)
    const itemB = await createTestRssFeedItemWithUrl(feedB)

    const result = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
      topic_ids: [topicA.id],
    })

    const entityIds = result.results.map(r => r.entity_id)
    expect(entityIds).toContain(itemA.id)
    expect(entityIds).not.toContain(itemB.id)
  }, 60_000)

  it('pagination with share cursor (shareEventIdLt) applies published_at <= bound inside direct_candidate CTE', async () => {
    const sharer = await createTestUser()
    const follower = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(follower, feedId)
    await followUser(follower, sharer)

    const directItem1 = await createTestRssFeedItemWithUrl(feedId)
    const directItem2 = await createTestRssFeedItemWithUrl(feedId)
    await processFollowerDistributionChunk(
      (await shareRssFeedItemWithFollowers(sharer, directItem1.id)).distribution_id,
    )

    // Page 1: limit 1 — share appears first (sort_rank=1 beats direct sort_rank=0)
    const page1 = await getRssFeedItemFeedIds(follower, { feed_type: 'any', limit: 1 })
    expect(page1.results.length).toBe(1)
    expect(page1.page_info.has_next_page).toBe(true)

    // Page 2: cursor from page1; if page1 ended on the share, shareEventIdLt branch fires
    const page2 = await getRssFeedItemFeedIds(follower, {
      feed_type: 'any',
      after: page1.page_info.end_cursor!,
      limit: 10,
    })
    expect(page2.results.length).toBeGreaterThanOrEqual(1)

    const allResults = [...page1.results, ...page2.results]
    const allResultIds = allResults.map(r => r.id)
    const allEntityIds = allResults.map(r => r.entity_id)
    // result_id is unique per page entry (share and direct are separate entries)
    expect(new Set(allResultIds).size).toBe(allResultIds.length)
    // directItem1 appears as both share (page1) and direct (page2); directItem2 as direct
    expect(allEntityIds).toContain(directItem1.id)
    expect(allEntityIds).toContain(directItem2.id)
  }, 60_000)

  it('category topics on items do not affect topic_ids source-feed filter', async () => {
    const user = await createTestUser()
    const feedTopic = await createTestTopic()
    const categoryTopic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    await followRssFeed(user, feedId)

    const item = await createTestRssFeedItemWithUrl(feedId)
    await addCategoryToRssFeedItem(item.id, categoryTopic.id)

    // Filtering by categoryTopic.id should NOT match — topic_ids filters by source feed topic
    const resultByCategory = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
      topic_ids: [categoryTopic.id],
    })
    expect(resultByCategory.results.map(r => r.entity_id)).not.toContain(item.id)

    // Filtering by feedTopic.id SHOULD match — that is the source feed's topic
    const resultByFeedTopic = await getRssFeedItemFeedIds(user, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
      topic_ids: [feedTopic.id],
    })
    expect(resultByFeedTopic.results.map(r => r.entity_id)).toContain(item.id)
  }, 60_000)
})
