import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  addDummyEmbeddingToRssFeedItem,
  insertTestRssFeedDirect,
  insertTestStory,
  makeRandomEmbedding,
  overrideDynamicConfigFieldsForTest,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { searchRssFeedItemsBySemantic } from './search-semantic.mts'
import { upsertRssFeedItems } from './upsert.mts'
import { rssFeedItemsWorkConfig } from './work-limits.mts'

function makeOrthogonalUnitVector(base: readonly number[]): number[] {
  const candidate = makeRandomEmbedding()
  const dot = candidate.reduce((sum, value, index) => sum + value * (base[index] ?? 0), 0)
  const orthogonal = candidate.map((value, index) => value - dot * (base[index] ?? 0))
  const norm = Math.hypot(...orthogonal)
  return orthogonal.map(value => value / norm)
}

function makeRankedNearEmbedding(
  base: readonly number[],
  orthogonal: readonly number[],
  rank: number,
): number[] {
  const theta = 0.05 * (rank + 1)
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return base.map((value, index) => cos * value + sin * (orthogonal[index] ?? 0))
}

async function seedRankedItems(
  feedId: string,
  baseEmbedding: readonly number[],
  count: number,
  tag: string,
): Promise<string[]> {
  const orthogonal = makeOrthogonalUnitVector(baseEmbedding)
  const items = await upsertRssFeedItems(
    feedId,
    Array.from({ length: count }, (_, index) => ({
      link: `https://example.com/${tag}-${index}-${randomUUID()}`,
      guid: `${tag}-${index}-${randomUUID()}`,
      title: `Semantic window ${tag} ${index}`,
      pubDate: new Date(2025, 0, index + 1).toISOString(),
    })),
  )
  await Promise.all(
    items.map((item, index) =>
      addDummyEmbeddingToRssFeedItem(item.id, {
        embedding: makeRankedNearEmbedding(baseEmbedding, orthogonal, index),
      }),
    ),
  )
  return items.map(item => item.id)
}

describe('unscoped semantic RSS candidate window', () => {
  it('caps unscoped pagination at semantic_rss_item_candidate_limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      semantic_rss_item_candidate_limit: 2,
    })
    try {
      const feed = await insertTestRssFeedDirect({})
      const queryEmbedding = makeRandomEmbedding()
      const ids = await seedRankedItems(feed.id, queryEmbedding, 3, 'cap')
      const dependencies = { getCachedSearchEmbedding: async () => queryEmbedding }
      const query = `cap-page-${randomUUID()}`

      const page1 = await searchRssFeedItemsBySemantic({
        semantic_search_query: query,
        limit: 1,
        dependencies,
      })
      expect(page1.results.map(item => item.id)).toEqual([ids[0]])
      expect(page1.page_info.has_next_page).toBe(true)
      expect(page1.page_info.end_cursor).toEqual(expect.any(String))

      const page2 = await searchRssFeedItemsBySemantic({
        semantic_search_query: query,
        limit: 1,
        after: page1.page_info.end_cursor ?? undefined,
        dependencies,
      })
      expect(page2.results.map(item => item.id)).toEqual([ids[1]])
      expect(page2.page_info.has_next_page).toBe(false)
      expect(page2.page_info.end_cursor).toBeNull()
    } finally {
      restore()
    }
  })

  it('deduplicates stories inside the bounded prefix without backfilling beyond k', async () => {
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      semantic_rss_item_candidate_limit: 2,
    })
    try {
      const feed = await insertTestRssFeedDirect({})
      const queryEmbedding = makeRandomEmbedding()
      const ids = await seedRankedItems(feed.id, queryEmbedding, 3, 'story-cap')
      const story = await insertTestStory({})
      await Promise.all([
        setTestItemStoryId(ids[0]!, story.id),
        setTestItemStoryId(ids[1]!, story.id),
      ])

      const result = await searchRssFeedItemsBySemantic({
        semantic_search_query: `story-cap-${randomUUID()}`,
        limit: 10,
        dependencies: { getCachedSearchEmbedding: async () => queryEmbedding },
      })
      expect(result.results.map(item => item.id)).toEqual([ids[0]])
      expect(result.page_info.has_next_page).toBe(false)
      expect(result.page_info.end_cursor).toBeNull()
    } finally {
      restore()
    }
  })

  it('applies the distance cutoff outside the prefix and leaves feed-scoped search uncapped', async () => {
    const restore = overrideDynamicConfigFieldsForTest(rssFeedItemsWorkConfig, {
      semantic_rss_item_candidate_limit: 1,
    })
    try {
      const feed = await insertTestRssFeedDirect({})
      const queryEmbedding = makeRandomEmbedding()
      const ids = await seedRankedItems(feed.id, queryEmbedding, 3, 'feed-scope')
      const dependencies = { getCachedSearchEmbedding: async () => queryEmbedding }

      const scoped = await searchRssFeedItemsBySemantic({
        semantic_search_query: `feed-scope-${randomUUID()}`,
        rss_feed_ids: [feed.id],
        limit: 10,
        dependencies,
      })
      expect(scoped.results.map(item => item.id)).toEqual(ids)

      const zero = await searchRssFeedItemsBySemantic({
        semantic_search_query: `zero-${randomUUID()}`,
        limit: 10,
        dependencies: { getCachedSearchEmbedding: async () => Array<number>(1024).fill(0) },
      })
      expect(zero.results).toEqual([])
      expect(zero.page_info.has_next_page).toBe(false)
    } finally {
      restore()
    }
  })
})
