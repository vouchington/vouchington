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

  it('sort=best pagination works across multiple pages without ILIKE', async () => {
    const uniqueSuffix = `BestNoSearch${Date.now()}`

    const topicA = await insertTestTopic({
      name: `${uniqueSuffix} Apple`,
      slug: `best-ns-a-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    const topicB = await insertTestTopic({
      name: `${uniqueSuffix} Banana`,
      slug: `best-ns-b-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    const topicC = await insertTestTopic({
      name: `${uniqueSuffix} Cherry`,
      slug: `best-ns-c-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })

    await setTopicBestSortInputs(topicA, 9)
    await setTopicBestSortInputs(topicB, 4)
    await setTopicBestSortInputs(topicC, 2)

    // Use text_search_query to scope to only the 3 test topics while exercising the score cursor.
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

  it('returns HTTP 400 for wrong cursor type on sort=relevance with text search', async () => {
    // Encode a SimpleCursor — not the expected TierCursor — and pass it to the relevance+text path
    const wrongCursor = encodeCursor({ id: 'some-id' })

    await expect(
      getTopicIds({ sort: 'relevance', text_search_query: 'anything', after: wrongCursor }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Invalid cursor for sort=relevance with text search (expected tier+id)',
    })
  })

  it('returns HTTP 400 for TierCursor on sort=relevance without text search', async () => {
    // A TierCursor from a previous relevance+text session should be rejected with the sort-specific message
    const wrongCursor = encodeCursor({ tier: 1, id: 'some-id' })

    await expect(getTopicIds({ sort: 'relevance', after: wrongCursor })).rejects.toMatchObject({
      status: 400,
      message: 'Invalid cursor for sort=relevance (expected id)',
    })
  })

  it('returns HTTP 400 for wrong cursor type on sort=best', async () => {
    // Encode a SimpleCursor — not the expected ScoreCursor — and pass it to the best path
    const wrongCursor = encodeCursor({ id: 'some-id' })

    await expect(getTopicIds({ sort: 'best', after: wrongCursor })).rejects.toMatchObject({
      status: 400,
    })
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof addSpendingCategoryToTopic)
})
