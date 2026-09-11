import { it, expect, beforeAll, describe } from 'vitest'

import {
  createTestUser,
  insertTestTopic,
  addSpendingCategoryToTopic,
  setTopicBestSortInputs,
} from '@voucha/test-helpers'

import { encodeCursor } from '@modules/pagination'

import { getTopicIds } from '../get-ids.mts'

import type { PrivateUser } from '@services/users/types'

describe('get-ids (pagination)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('pagination works with filters', async () => {
    // Create 5 topics with spending category
    const topicIds = []
    for (let i = 0; i < 5; i++) {
      const topicId = await insertTestTopic({
        name: `Spending Topic ${i} ${Math.random()}`,
        slug: `spending-${i}-${Date.now()}-${Math.random()}`,
        createdById: user.id,
      })
      topicIds.push(topicId)
      await addSpendingCategoryToTopic(topicId)
    }

    // First page with filter
    const page1 = await getTopicIds({
      spending_category: true,
      limit: 2,
    })

    // Should have at least 2 results (our topics or others with spending category)
    expect(page1.results.length).toBe(2)

    // Verify pagination works
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeTruthy()
    const page2 = await getTopicIds({
      spending_category: true,
      limit: 2,
      after: page1.page_info.end_cursor ?? undefined,
    })

    // Verify no overlap
    const page1Ids = new Set(page1.results.map(r => r.id))
    const page2Ids = new Set(page2.results.map(r => r.id))
    const overlap = [...page1Ids].filter(id => page2Ids.has(id))
    expect(overlap.length).toBe(0)

    // All results should have spending category (we can't directly verify this in the result,
    // but the query should have filtered correctly)
    expect(page2.results.length).toBeGreaterThan(0)
  })

  it('pagination works correctly for sort=relevance with text search across tiers', async () => {
    // Use a unique query that creates topics in different relevance tiers:
    // tier 0 (exact): topic name === query
    // tier 1 (prefix): topic name starts with query
    // tier 2 (contains): topic name contains but doesn't start with query
    const uniqueQuery = `RelevanceTier${Date.now()}`

    const exactTopic = await insertTestTopic({
      name: uniqueQuery,
      slug: `relevance-exact-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    const prefixTopic = await insertTestTopic({
      name: `${uniqueQuery} Extra`,
      slug: `relevance-prefix-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    const containsTopic = await insertTestTopic({
      name: `Before ${uniqueQuery}`,
      slug: `relevance-contains-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    // Paginate with limit=1 to exercise cross-tier cursor pagination
    const allTopicIds = new Set<string>()
    let after: string | undefined
    let iterations = 0

    while (iterations < 10) {
      const result = await getTopicIds({
        text_search_query: uniqueQuery,
        sort: 'relevance',
        limit: 1,
        after,
      })
      if (result.results.length === 0) break

      result.results.forEach(r => allTopicIds.add(r.id))
      if (!result.page_info.has_next_page) break
      after = result.page_info.end_cursor ?? undefined
      iterations++
    }

    // All three topics should be found across different tiers (0, 1, 2)
    expect(allTopicIds.has(exactTopic)).toBe(true)
    expect(allTopicIds.has(prefixTopic)).toBe(true)
    expect(allTopicIds.has(containsTopic)).toBe(true)
  })

  it('pagination works correctly for sort=best across multiple pages', async () => {
    const uniqueSuffix = `BestSort${Date.now()}`

    const topicA = await insertTestTopic({
      name: `${uniqueSuffix} Apple`,
      slug: `best-a-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    const topicB = await insertTestTopic({
      name: `${uniqueSuffix} Banana`,
      slug: `best-b-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    const topicC = await insertTestTopic({
      name: `${uniqueSuffix} Cherry`,
      slug: `best-c-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    await setTopicBestSortInputs(topicA, 10)
    await setTopicBestSortInputs(topicB, 5)
    await setTopicBestSortInputs(topicC, 1)

    // Paginate with limit=1 to exercise cursor pagination
    const allTopicIds: string[] = []
    let after: string | undefined

    for (let i = 0; i < 10; i++) {
      const result = await getTopicIds({
        sort: 'best',
        text_search_query: uniqueSuffix,
        limit: 1,
        after,
      })
      if (result.results.length === 0) break

      allTopicIds.push(...result.results.map(r => r.id))
      if (!result.page_info.has_next_page) break
      after = result.page_info.end_cursor ?? undefined
    }

    expect(allTopicIds[0]).toBe(topicA)
    expect(allTopicIds[1]).toBe(topicB)
    expect(allTopicIds[2]).toBe(topicC)
    expect(allTopicIds.filter(id => id === topicA).length).toBe(1)
    expect(allTopicIds.filter(id => id === topicB).length).toBe(1)
    expect(allTopicIds.filter(id => id === topicC).length).toBe(1)
  })

  it('pagination works correctly for sort=relevance without text search', async () => {
    // Without text_search_query, sort=relevance falls back to ORDER BY id DESC (same as sort=new)
    // and uses a SimpleCursor for pagination
    const topicIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const topicId = await insertTestTopic({
        name: `RelevanceNoSearch ${i} ${Math.random()}`,
        slug: `relevance-no-search-${i}-${Date.now()}-${Math.random()}`,
        createdById: user.id,
      })
      topicIds.push(topicId)
    }

    // Paginate with limit=1 — must not skip or repeat. Loop until all 3 are found.
    // Concurrent tests may create topics with higher UUIDs that appear first, so we
    // may need to page past them. Cap at 10 000 iterations to catch infinite-loop
    // regressions (e.g. a stuck cursor) while tolerating a very dirty DB.
    const allTopicIds = new Set<string>()
    let after: string | undefined
    let iterations = 0
    const MAX_ITERATIONS = 10_000

    while (!topicIds.every(id => allTopicIds.has(id)) && iterations < MAX_ITERATIONS) {
      const result = await getTopicIds({ sort: 'relevance', limit: 1, after })
      if (result.results.length === 0) break

      result.results.forEach(r => allTopicIds.add(r.id))
      if (!result.page_info.has_next_page) break
      after = result.page_info.end_cursor ?? undefined
      iterations++
    }

    expect(iterations).toBeLessThan(MAX_ITERATIONS)

    // All three created topics should be found across pages
    expect(allTopicIds.has(topicIds[0]!)).toBe(true)
    expect(allTopicIds.has(topicIds[1]!)).toBe(true)
    expect(allTopicIds.has(topicIds[2]!)).toBe(true)
  })

  it('LIKE metacharacters in text_search_query are treated as literals', async () => {
    const ts = Date.now()
    // Topic A: name literally contains the query with its underscore
    const topicA = await insertTestTopic({
      name: `LikeMeta_${ts}_extra`,
      slug: `like-meta-a-${ts}-${Math.random()}`,
      createdById: user.id,
    })

    // Topic B: X at the _ position — should NOT appear since _ is now a literal in the filter
    const topicB = await insertTestTopic({
      name: `LikeMetaX${ts}_extra`,
      slug: `like-meta-b-${ts}-${Math.random()}`,
      createdById: user.id,
    })

    const result = await getTopicIds({
      text_search_query: `LikeMeta_${ts}`,
      sort: 'relevance',
      limit: 10,
    })

    // Topic A contains the literal underscore — must appear
    expect(result.results.some(r => r.id === topicA)).toBe(true)
    // Topic B has X at the _ position — must not appear (escaped ILIKE rejects it)
    expect(result.results.some(r => r.id === topicB)).toBe(false)
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof encodeCursor)
})
