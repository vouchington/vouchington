import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toolsSearchRssFeedItemIds } from './search.mts'
import { addDummyEmbeddingToRssFeedItem, insertTestRssFeedDirect } from '@voucha/test-helpers'
import { upsertRssFeedItems } from '../upsert.mts'

// Shared fixtures created once for all tests
let feedId: string
let itemId1: string
let itemId2: string
let textSearchKey: string
const getCachedSearchEmbeddingMock = vi.fn<VitestLooseMock>()
const dependencies = { getCachedSearchEmbedding: getCachedSearchEmbeddingMock }

describe('search', () => {
  beforeAll(async () => {
    const feed = await insertTestRssFeedDirect({})
    feedId = feed.id
    const random = Math.random().toString(36).slice(2, 10)
    const guid1 = `tools-search-a-${random}`
    const guid2 = `tools-search-b-${random}`
    textSearchKey = `uniqtok${random}`

    // Create 30 items to guarantee the cap-at-25 test works even on a clean DB
    const feedItemInputs = Array.from({ length: 30 }, (_, i) => ({
      link: `https://example.com/tools-search-${i}-${random}`,
      guid: i === 0 ? guid1 : i === 1 ? guid2 : `tools-search-${i}-${random}`,
      title: i < 2 ? `${textSearchKey} article ${i}` : `cap test article ${i} ${random}`,
      pubDate: new Date(2025, 0, i + 1).toISOString(),
    }))

    const upsertedItems = await upsertRssFeedItems(feedId, feedItemInputs)
    itemId1 = upsertedItems[0].id
    itemId2 = upsertedItems[1].id

    // Add identical embeddings so cosine similarity to the mocked query vector is 1.0
    const MOCK_EMBEDDING = Array(1024).fill(0.1)
    for (const item of upsertedItems) {
      await addDummyEmbeddingToRssFeedItem(item.id, { embedding: MOCK_EMBEDDING })
    }
  }, 60_000)

  describe('toolsSearchRssFeedItemIds', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('uses search_vector for text search queries without calling embeddings', async () => {
      const results = await toolsSearchRssFeedItemIds({
        text_search_query: ` ${textSearchKey} `,
        dependencies,
      })

      expect(getCachedSearchEmbeddingMock).not.toHaveBeenCalled()
      expect(Array.isArray(results)).toBe(true)
      // Both test items should appear (they share the unique textSearchKey)
      const ids = results.map(r => r.id)
      expect(ids).toContain(itemId1)
      expect(ids).toContain(itemId2)
    })

    it('calls getCachedSearchEmbedding with trimmed query for semantic search', async () => {
      // Return a 1024-dim embedding matching our dummy items (all 0.1 → zero cosine distance)
      getCachedSearchEmbeddingMock.mockResolvedValue(Array(1024).fill(0.1))

      const results = await toolsSearchRssFeedItemIds({
        semantic_search_query: '  ai agents  ',
        limit: 3,
        dependencies,
      })

      expect(getCachedSearchEmbeddingMock).toHaveBeenCalledWith('ai agents')
      expect(Array.isArray(results)).toBe(true)
      // Semantic search should return items with embeddings that pass the distance threshold
      expect(results.length).toBeGreaterThan(0)
    })

    it('excludes the source item from similar rss feed item search', async () => {
      const results = await toolsSearchRssFeedItemIds({
        similar_rss_feed_item_id: itemId1,
        dependencies,
      })

      expect(getCachedSearchEmbeddingMock).not.toHaveBeenCalled()
      // Source item must not appear in results
      const ids = results.map(r => r.id)
      expect(ids).not.toContain(itemId1)
    })

    it('rejects malformed similar_rss_feed_item_id values', async () => {
      await expect(
        toolsSearchRssFeedItemIds({
          similar_rss_feed_item_id: 'not-a-uuid',
          dependencies,
        }),
      ).rejects.toThrow('must be a valid UUID')

      expect(getCachedSearchEmbeddingMock).not.toHaveBeenCalled()
    })

    it('returns results ordered by published_at DESC for text-only search', async () => {
      const rand = Math.random().toString(36).slice(2, 10)
      const orderKey = `orderkw${rand}`
      const feed = await insertTestRssFeedDirect({})

      const upserted = await upsertRssFeedItems(feed.id, [
        {
          link: `https://example.com/order-old-${rand}`,
          guid: `order-old-${rand}`,
          title: `${orderKey} old article`,
          pubDate: '2024-01-01T00:00:00Z',
        },
        {
          link: `https://example.com/order-new-${rand}`,
          guid: `order-new-${rand}`,
          title: `${orderKey} new article`,
          pubDate: '2025-01-01T00:00:00Z',
        },
      ])

      const oldItemId = upserted[0].id
      const newItemId = upserted[1].id

      const results = await toolsSearchRssFeedItemIds({
        text_search_query: orderKey,
        limit: 10,
        dependencies,
      })

      expect(getCachedSearchEmbeddingMock).not.toHaveBeenCalled()
      expect(results.length).toBe(2)
      // Newer item (2025) should come before older item (2024)
      expect(results[0].id).toBe(newItemId)
      expect(results[1].id).toBe(oldItemId)
    })

    it('caps results at 25 for tool-facing callers', async () => {
      // beforeAll seeds 30 items with dummy embeddings; semantic search matches all of them.
      getCachedSearchEmbeddingMock.mockResolvedValue(Array(1024).fill(0.1))

      const results = await toolsSearchRssFeedItemIds({
        semantic_search_query: 'anything',
        limit: 999,
        dependencies,
      })

      // The service always enforces a 25-result cap regardless of requested limit
      expect(results.length).toBe(25)
    })
  })
})
