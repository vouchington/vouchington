import { it, expect, vi, beforeAll, beforeEach, describe } from 'vitest'
import { runAutotaggerOnRssFeedItem } from './run-rss-feed-item.mts'
import type { ViewRssFeedItem } from '@services/rss-feed-items/types'
import { insertRssFeedItemAutotaggingResult } from '@services/autotagger'
import {
  insertTestRssFeedItem,
  createRandomString,
  setupTestAutotaggerAgent,
  createTestTopic,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { addUrl } from '@services/urls/upsert'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import { createTopicAliases } from '@services/topics/aliases'

// Kill-switch / discoverability / collaborative-topic tests live in
// run-rss-feed-item.part-2.test.mts (split to stay under the per-file line cap).

let activePromptId: string
let testRssFeedId: string

describe('runAutotaggerOnRssFeedItem', () => {
  beforeAll(async () => {
    const activePrompt = await setupTestAutotaggerAgent()
    activePromptId = activePrompt.id

    const feed = await createTestRssFeed({})
    testRssFeedId = feed.id
  }, 30_000)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('works with RSS feed items', async () => {
    const callOpenAIAutotagger = vi.fn<VitestLooseMock>().mockResolvedValue({ topics_added: [] })

    const itemGuid = `test-item-${createRandomString(12)}`
    const urlEntry = await addUrl(
      null,
      `https://autotag-test-${createRandomString(8)}.example.com/item`,
    )
    const insertedItemId = await insertTestRssFeedItem({
      rssFeedId: testRssFeedId,
      urlId: urlEntry!.id,
      guid: itemGuid,
      itemData: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'RSS Item Title',
        content: 'RSS item content',
      },
      contentSha256: Buffer.alloc(32),
    })
    const item: Partial<ViewRssFeedItem> = {
      id: insertedItemId,
      guid: itemGuid,
      data: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'RSS Item Title',
        content: 'RSS item content',
      },
    }

    const result = await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem, {
      callOpenAIAutotagger,
      searchSeededTopics: vi.fn<VitestLooseMock>().mockResolvedValue([]),
    })

    expect(result).not.toBeNull()
    expect(result!.skipped).toBe(false)
    expect(callOpenAIAutotagger).toHaveBeenCalledWith(
      expect.any(Object),
      'rss_feed_item',
      insertedItemId,
      expect.stringContaining('RSS Item Title'),
      expect.objectContaining({
        conversationId: expect.any(String),
        conversationMessageId: expect.any(String),
        instructions: 'Test prompt',
        seeded_topics: [],
      }),
    )
  })

  it('returns null if existing result found', async () => {
    const itemGuid = `test-item-existing-${createRandomString(12)}`
    const urlEntry = await addUrl(
      null,
      `https://autotag-test-${createRandomString(8)}.example.com/item`,
    )
    const itemId = await insertTestRssFeedItem({
      rssFeedId: testRssFeedId,
      urlId: urlEntry!.id,
      guid: itemGuid,
      itemData: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'Same Title',
        content: 'Same content',
      },
      contentSha256: Buffer.alloc(32),
    })
    await insertRssFeedItemAutotaggingResult(itemId, Buffer.alloc(32), activePromptId, [])

    const item: Partial<ViewRssFeedItem> = {
      id: itemId,
      guid: itemGuid,
      data: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'Same Title',
        content: 'Same content',
      },
    }

    const result = await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem)

    expect(result).toBeNull()
  })

  it('merges feed-mapped and embedding-search topics into seeded_topics via the real search', async () => {
    const callOpenAIAutotagger = vi.fn<VitestLooseMock>().mockResolvedValue({ topics_added: [] })

    const topic = await createTestTopic({
      name: `Real Search Topic ${createRandomString(8)}`,
      slug: `real-search-topic-${createRandomString(8)}`,
    })
    const categoryText = `real-search-cat-${createRandomString(8)}`
    await createTopicAliases(topic.id, [categoryText])

    const itemGuid = `real-search-item-${createRandomString(12)}`
    const urlEntry = await addUrl(
      null,
      `https://real-search-test-${createRandomString(8)}.example.com/item`,
    )
    const insertedItemId = await insertTestRssFeedItem({
      rssFeedId: testRssFeedId,
      urlId: urlEntry!.id,
      guid: itemGuid,
      itemData: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'RSS Item Title',
        content: 'RSS item content',
      },
      contentSha256: Buffer.alloc(32),
    })
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: insertedItemId, categories: [categoryText] },
    ])

    const item: Partial<ViewRssFeedItem> = {
      id: insertedItemId,
      guid: itemGuid,
      data: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'RSS Item Title',
        content: 'RSS item content',
      },
    }

    // No searchSeededTopics override -- exercises the real dispatch.searchSeededTopics closure
    // (feed-mapped + embedding-search merge/dedup/cap), not a test double.
    await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem, { callOpenAIAutotagger })

    expect(callOpenAIAutotagger).toHaveBeenCalledWith(
      expect.any(Object),
      'rss_feed_item',
      insertedItemId,
      expect.any(String),
      expect.objectContaining({
        seeded_topics: expect.arrayContaining([expect.objectContaining({ id: topic.id })]),
      }),
    )
  })

  it('returns an error result when the LLM call fails', async () => {
    const callOpenAIAutotagger = vi
      .fn<VitestLooseMock>()
      .mockRejectedValue(new Error('OpenAI API error'))

    const itemGuid = `error-item-${createRandomString(12)}`
    const urlEntry = await addUrl(
      null,
      `https://error-test-${createRandomString(8)}.example.com/item`,
    )
    const insertedItemId = await insertTestRssFeedItem({
      rssFeedId: testRssFeedId,
      urlId: urlEntry!.id,
      guid: itemGuid,
      itemData: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'RSS Item Title',
        content: 'RSS item content',
      },
      contentSha256: Buffer.alloc(32),
    })

    const item: Partial<ViewRssFeedItem> = {
      id: insertedItemId,
      guid: itemGuid,
      data: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'RSS Item Title',
        content: 'RSS item content',
      },
    }

    const result = await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem, {
      callOpenAIAutotagger,
      searchSeededTopics: vi.fn<VitestLooseMock>().mockResolvedValue([]),
    })

    expect(result).not.toBeNull()
    expect(result!.error).toContain('OpenAI API error')
    expect(result!.rss_feed_item_id).toBe(insertedItemId)
    expect(result!.topics_added).toEqual([])
  })

  it('passes feed-mapped topics as seeded_topics', async () => {
    const callOpenAIAutotagger = vi.fn<VitestLooseMock>().mockResolvedValue({ topics_added: [] })

    const topic = await createTestTopic({
      name: `Dedup Test Topic ${createRandomString(8)}`,
      slug: `dedup-topic-${createRandomString(8)}`,
    })
    const categoryText = `dedup-cat-${createRandomString(8)}`
    await createTopicAliases(topic.id, [categoryText])

    const itemGuid = `dedup-item-${createRandomString(12)}`
    const urlEntry = await addUrl(
      null,
      `https://dedup-test-${createRandomString(8)}.example.com/item`,
    )
    const insertedItemId = await insertTestRssFeedItem({
      rssFeedId: testRssFeedId,
      urlId: urlEntry!.id,
      guid: itemGuid,
      itemData: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'RSS Item Title',
        content: 'RSS item content',
      },
      contentSha256: Buffer.alloc(32),
    })
    await upsertRssFeedItemCategories([
      { rss_feed_item_id: insertedItemId, categories: [categoryText] },
    ])

    const item: Partial<ViewRssFeedItem> = {
      id: insertedItemId,
      guid: itemGuid,
      data: {
        link: 'https://example.com',
        guid: itemGuid,
        title: 'RSS Item Title',
        content: 'RSS item content',
      },
    }

    await runAutotaggerOnRssFeedItem(item as ViewRssFeedItem, {
      callOpenAIAutotagger,
      searchSeededTopics: vi
        .fn<VitestLooseMock>()
        .mockResolvedValue([{ id: topic.id, name: topic.name }]),
    })

    expect(callOpenAIAutotagger).toHaveBeenCalledWith(
      expect.any(Object),
      'rss_feed_item',
      insertedItemId,
      expect.any(String),
      expect.objectContaining({
        seeded_topics: expect.arrayContaining([expect.objectContaining({ id: topic.id })]),
      }),
    )
  })
})
