import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createTestUser,
  insertTestTopic,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { getTopicIds } from '../get-ids.mts'

describe('getTopicIds semantic_search_query', () => {
  let testUser: PrivateUser

  beforeAll(async () => {
    testUser = await createTestUser()
  })

  it('paginates with ranking cursors', { timeout: 30_000 }, async () => {
    const query = `semantic topic search test ${crypto.randomUUID()}`
    const queryEmbedding = makeRandomEmbedding()
    await seedSearchEmbeddingCache(query, queryEmbedding)
    const topicIds = await Promise.all(
      Array.from({ length: 3 }, async (_, index) => {
        const id = await insertTestTopic({
          name: `SemanticTopic ${index} ${crypto.randomUUID()}`,
          slug: `sem-topic-${crypto.randomUUID()}`,
          createdById: testUser.id,
        })
        await updateTopicEmbeddingData({
          topicId: id,
          inputSha256: createHash('sha256').update(`${query}:${id}`).digest(),
          embedding: makeNearbyEmbedding(queryEmbedding),
          tokens: 10,
        })
        return id
      }),
    )

    const found = new Set<string>()
    let after: string | undefined

    for (let index = 0; index < 10; index++) {
      const result = await getTopicIds({
        semantic_search_query: query,
        sort: 'relevance',
        limit: 1,
        after,
      })

      result.results.forEach(result => found.add(result.id))
      if (!result.page_info.has_next_page) break
      after = result.page_info.end_cursor ?? undefined
    }

    for (const topicId of topicIds) expect(found.has(topicId)).toBe(true)
  })
})
