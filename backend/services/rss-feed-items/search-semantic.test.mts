import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { searchRssFeedItemsBySemantic } from './search-semantic.mts'
import { searchRssFeedItems } from './search.mts'
import {
  addDummyEmbeddingToRssFeedItem,
  insertTestRssFeedDirect,
  insertTestStory,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { upsertRssFeedItems } from './upsert.mts'

// Query and fixture vectors stay distinct so HNSW traversal remains realistic.
const MOCK_EMBEDDING = makeRandomEmbedding()
const TIE_QUERY_EMBEDDING = [1, ...Array<number>(1023).fill(0)]
const ZERO_EMBEDDING = Array<number>(1024).fill(0)
const getCachedSearchEmbeddingMock = vi.fn<VitestLooseMock>()
const dependencies = { getCachedSearchEmbedding: getCachedSearchEmbeddingMock }

let storyItemId: string
let storyId: string
let feedId: string

describe('searchRssFeedItemsBySemantic', () => {
  beforeAll(async () => {
    const feed = await insertTestRssFeedDirect({})
    feedId = feed.id
    const random = randomUUID()

    const upserted = await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/semantic-a-${random}`,
        guid: `semantic-a-${random}`,
        title: `Semantic test A ${random}`,
        pubDate: new Date(2025, 0, 1).toISOString(),
      },
      {
        link: `https://example.com/semantic-b-${random}`,
        guid: `semantic-b-${random}`,
        title: `Semantic test B ${random}`,
        pubDate: new Date(2025, 0, 2).toISOString(),
      },
      {
        link: `https://example.com/semantic-c-${random}`,
        guid: `semantic-c-${random}`,
        title: `Semantic test C ${random}`,
        pubDate: new Date(2025, 0, 3).toISOString(),
      },
    ])

    storyItemId = upserted[2].id

    const embeddings = await Promise.allSettled(
      upserted.map(item =>
        addDummyEmbeddingToRssFeedItem(item.id, {
          embedding: makeNearbyEmbedding(MOCK_EMBEDDING),
        }),
      ),
    )
    for (const result of embeddings) {
      if (result.status === 'rejected') throw result.reason
    }

    // Two owned candidates share a story; the remaining item keeps pagination nonempty.
    const story = await insertTestStory({})
    storyId = story.id
    await setTestItemStoryId(upserted[1].id, storyId)
    await setTestItemStoryId(storyItemId, storyId)
  }, 30_000)

  beforeEach(() => {
    vi.clearAllMocks()
    getCachedSearchEmbeddingMock.mockResolvedValue(MOCK_EMBEDDING)
  })

  it('returns items ranked by semantic similarity', async () => {
    const result = await searchRssFeedItemsBySemantic({
      semantic_search_query: 'developer tools',
      rss_feed_ids: [feedId],
      limit: 1,
      dependencies,
    })
    expect(result.page_info.has_next_page).toBe(true)
    expect(result.page_info.end_cursor).toEqual(expect.any(String))
    expect(result.results).toHaveLength(1)
    expect(result.results.every(r => r.__entity_type === 'rss_feed_item')).toBe(true)
    expect(getCachedSearchEmbeddingMock).toHaveBeenCalledWith('developer tools')
  })

  it('returns empty results when query embedding has zero similarity', async () => {
    getCachedSearchEmbeddingMock.mockResolvedValue(ZERO_EMBEDDING)
    const result = await searchRssFeedItemsBySemantic({
      semantic_search_query: 'completely unrelated query xyz',
      rss_feed_ids: [feedId],
      limit: 5,
      dependencies,
    })
    // Zero vector has undefined cosine distance — items should not match threshold
    expect(result.results).toHaveLength(0)
    expect(result.page_info.has_next_page).toBe(false)
  })

  it('deduplicates items sharing the same story_id', async () => {
    const result = await searchRssFeedItemsBySemantic({
      semantic_search_query: 'developer tools',
      rss_feed_ids: [feedId],
      limit: 10,
      dependencies,
    })
    const storyIds = result.results.flatMap(r => (r.story_id !== null ? [r.story_id] : []))
    const uniqueStoryIds = new Set(storyIds)
    // No story_id should appear more than once in results
    expect(storyIds.length).toBe(uniqueStoryIds.size)
    expect(result.results).toHaveLength(2)
    expect(storyIds).toEqual([storyId])
  })

  it('traverses relevance pages without duplicating items', async () => {
    const firstPage = await searchRssFeedItemsBySemantic({
      semantic_search_query: 'developer tools',
      rss_feed_ids: [feedId],
      limit: 1,
      dependencies,
    })
    const secondPage = await searchRssFeedItemsBySemantic({
      semantic_search_query: 'developer tools',
      rss_feed_ids: [feedId],
      limit: 1,
      after: firstPage.page_info.end_cursor ?? undefined,
      dependencies,
    })

    expect(firstPage.results).toHaveLength(1)
    expect(secondPage.results).toHaveLength(1)
    expect(secondPage.results[0]?.id).not.toBe(firstPage.results[0]?.id)
    expect(secondPage.page_info.has_next_page).toBe(false)
    expect(secondPage.page_info.end_cursor).toBeNull()
    expect(secondPage.page_info.start_cursor).toEqual(expect.any(String))
  })

  it('orders equal relevance scores by published_at then id', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = randomUUID()
    const samePublishedAt = new Date(2025, 0, 10).toISOString()
    const items = await upsertRssFeedItems(
      feed.id,
      ['a', 'b', 'c'].map(key => ({
        link: `https://example.com/semantic-tie-${key}-${random}`,
        guid: `semantic-tie-${key}-${random}`,
        title: `Semantic tie ${key} ${random}`,
        pubDate: samePublishedAt,
      })),
    )
    const embeddings = await Promise.allSettled(
      items.map((item, index) =>
        addDummyEmbeddingToRssFeedItem(item.id, {
          embedding: makeEquidistantEmbedding(index + 1),
        }),
      ),
    )
    for (const result of embeddings) {
      if (result.status === 'rejected') throw result.reason
    }

    const result = await searchRssFeedItemsBySemantic({
      semantic_search_query: 'developer tools',
      rss_feed_ids: [feed.id],
      limit: 10,
      dependencies: { getCachedSearchEmbedding: async () => TIE_QUERY_EMBEDDING },
    })
    expect(result.results.map(item => item.id)).toEqual(
      items
        .map(item => item.id)
        .toSorted()
        .toReversed(),
    )
  })

  it('deduplicates story candidates before applying a page keyset', async () => {
    const feed = await insertTestRssFeedDirect({})
    const random = randomUUID()
    const items = await upsertRssFeedItems(
      feed.id,
      Array.from({ length: 5 }, (_, index) => ({
        link: `https://example.com/semantic-story-${index}-${random}`,
        guid: `semantic-story-${index}-${random}`,
        title: `Semantic story ${index} ${random}`,
        pubDate: new Date(2025, 0, index + 1).toISOString(),
      })),
    )
    const embeddings = await Promise.allSettled(
      items.map((item, index) =>
        addDummyEmbeddingToRssFeedItem(item.id, {
          embedding: makeRankedEmbedding(index),
        }),
      ),
    )
    for (const result of embeddings) {
      if (result.status === 'rejected') throw result.reason
    }
    const story = await insertTestStory({})
    const assignments = await Promise.allSettled([
      setTestItemStoryId(items[0].id, story.id),
      setTestItemStoryId(items[1].id, story.id),
    ])
    for (const result of assignments) {
      if (result.status === 'rejected') throw result.reason
    }

    const firstPage = await searchRssFeedItemsBySemantic({
      semantic_search_query: 'developer tools',
      rss_feed_ids: [feed.id],
      limit: 2,
      dependencies: { getCachedSearchEmbedding: async () => TIE_QUERY_EMBEDDING },
    })
    const secondPage = await searchRssFeedItemsBySemantic({
      semantic_search_query: 'developer tools',
      rss_feed_ids: [feed.id],
      limit: 2,
      after: firstPage.page_info.end_cursor ?? undefined,
      dependencies: { getCachedSearchEmbedding: async () => TIE_QUERY_EMBEDDING },
    })
    const returnedStoryItems = [...firstPage.results, ...secondPage.results].filter(
      item => item.story_id === story.id,
    )
    expect(returnedStoryItems).toHaveLength(1)
    const returnedIds = [...firstPage.results, ...secondPage.results].map(item => item.id)
    expect(returnedIds).toEqual([items[0].id, items[2].id, items[3].id, items[4].id])
    expect(new Set(returnedIds)).toHaveLength(4)
    expect(secondPage.page_info.has_next_page).toBe(false)
    expect(secondPage.page_info.end_cursor).toBeNull()
  })

  it('delegates to semantic path when searchRssFeedItems receives semantic_search_query', async () => {
    const result = await searchRssFeedItems({
      semantic_search_query: 'developer tools',
      rss_feed_ids: [feedId],
      limit: 1,
      dependencies,
    })
    expect(getCachedSearchEmbeddingMock).toHaveBeenCalled()
    expect(result.page_info.end_cursor).toEqual(expect.any(String))
  })

  it('skips embedding call when semantic_search_query is absent', async () => {
    await searchRssFeedItems({ rss_feed_ids: [feedId], limit: 3 })
    expect(getCachedSearchEmbeddingMock).not.toHaveBeenCalled()
  })

  it('skips embedding call when semantic_search_query is whitespace-only', async () => {
    await searchRssFeedItems({ semantic_search_query: '   ', rss_feed_ids: [feedId], limit: 3 })
    expect(getCachedSearchEmbeddingMock).not.toHaveBeenCalled()
  })
})

function makeEquidistantEmbedding(axis: number): number[] {
  const vector = Array<number>(1024).fill(0)
  vector[0] = Math.sqrt(0.99)
  vector[axis] = Math.sqrt(0.01)
  return vector
}

function makeRankedEmbedding(rank: number): number[] {
  const delta = 0.01 * (rank + 1)
  const vector = Array<number>(1024).fill(0)
  vector[0] = Math.sqrt(1 - delta ** 2)
  vector[1] = delta
  return vector
}
