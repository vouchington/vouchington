import { createHash, randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import {
  createTestUser,
  insertTestTopic,
  makeRandomEmbedding,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { topicsWorkConfig } from '../../work-limits.mts'
import { getTopicIds } from '../get-ids.mts'

function makeOrthogonalUnitVector(base: readonly number[]): number[] {
  const candidate = makeRandomEmbedding()
  const dot = candidate.reduce((sum, value, index) => sum + value * (base[index] ?? 0), 0)
  const orthogonal = candidate.map((value, index) => value - dot * (base[index] ?? 0))
  const norm = Math.hypot(...orthogonal)
  return orthogonal.map(value => value / norm)
}

function makeEmbeddingAtDistance(
  base: readonly number[],
  orthogonal: readonly number[],
  cosineDistance: number,
): number[] {
  const cos = 1 - cosineDistance
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos))
  return base.map((value, index) => cos * value + sin * (orthogonal[index] ?? 0))
}

function makeRankedNearEmbedding(
  base: readonly number[],
  orthogonal: readonly number[],
  rank: number,
): number[] {
  const theta = 0.05 * (rank + 1)
  return makeEmbeddingAtDistance(base, orthogonal, 1 - Math.cos(theta))
}

async function seedRankedTopics(
  userId: string,
  baseEmbedding: readonly number[],
  distances: readonly number[],
  tag: string,
): Promise<string[]> {
  const orthogonal = makeOrthogonalUnitVector(baseEmbedding)
  return Promise.all(
    distances.map(async (distance, index) => {
      const id = await insertTestTopic({
        name: `SemanticWindow ${tag} ${index} ${randomUUID()}`,
        slug: `sem-win-${tag}-${index}-${randomUUID()}`,
        createdById: userId,
      })
      await updateTopicEmbeddingData({
        topicId: id,
        inputSha256: createHash('sha256').update(`${tag}:${id}`).digest(),
        embedding: makeEmbeddingAtDistance(baseEmbedding, orthogonal, distance),
        tokens: 10,
      })
      return id
    }),
  )
}

describe('semantic topic candidate window', () => {
  let testUser: PrivateUser

  beforeAll(async () => {
    testUser = await createTestUser()
  })

  it('caps semantic pagination at semantic_topic_candidate_limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      semantic_topic_candidate_limit: 2,
    })
    try {
      const queryEmbedding = makeRandomEmbedding()
      const orthogonal = makeOrthogonalUnitVector(queryEmbedding)
      const tag = `cap-${randomUUID()}`
      const ids = await Promise.all(
        Array.from({ length: 3 }, async (_, index) => {
          const id = await insertTestTopic({
            name: `SemanticWindow ${tag} ${index} ${randomUUID()}`,
            slug: `sem-win-${tag}-${index}-${randomUUID()}`,
            createdById: testUser.id,
          })
          await updateTopicEmbeddingData({
            topicId: id,
            inputSha256: createHash('sha256').update(`${tag}:${id}`).digest(),
            embedding: makeRankedNearEmbedding(queryEmbedding, orthogonal, index),
            tokens: 10,
          })
          return id
        }),
      )

      const page1 = await getTopicIds({
        semantic_search_query: tag,
        semanticSearchEmbedding: queryEmbedding,
        sort: 'relevance',
        limit: 1,
      })
      expect(page1.results.map(topic => topic.id)).toEqual([ids[0]])
      expect(page1.page_info.has_next_page).toBe(true)
      expect(page1.page_info.end_cursor).toEqual(expect.any(String))

      const page2 = await getTopicIds({
        semantic_search_query: tag,
        semanticSearchEmbedding: queryEmbedding,
        sort: 'relevance',
        limit: 1,
        after: page1.page_info.end_cursor ?? undefined,
      })
      expect(page2.results.map(topic => topic.id)).toEqual([ids[1]])
      expect(page2.page_info.has_next_page).toBe(false)
      expect(page2.page_info.end_cursor).toBeNull()
    } finally {
      restore()
    }
  })

  it('excludes topics beyond the 0.75 distance cutoff inside the k-nearest prefix', async () => {
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      semantic_topic_candidate_limit: 3,
    })
    try {
      const queryEmbedding = makeRandomEmbedding()
      const tag = `cutoff-${randomUUID()}`
      const [nearFirst, nearSecond, beyondCutoff] = await seedRankedTopics(
        testUser.id,
        queryEmbedding,
        [0.05, 0.1, 0.78],
        tag,
      )

      const all = await getTopicIds({
        semantic_search_query: tag,
        semanticSearchEmbedding: queryEmbedding,
        sort: 'relevance',
        limit: 10,
      })
      expect(all.results.map(topic => topic.id)).toEqual([nearFirst, nearSecond])
      expect(all.results.map(topic => topic.id)).not.toContain(beyondCutoff)
      expect(all.page_info.has_next_page).toBe(false)
      expect(all.page_info.end_cursor).toBeNull()
    } finally {
      restore()
    }
  })

  it('caps similar_topic_id search at semantic_topic_candidate_limit while excluding the source topic', async () => {
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      semantic_topic_candidate_limit: 2,
    })
    try {
      const baseEmbedding = makeRandomEmbedding()
      const tag = `sim-${randomUUID()}`
      const [sourceId, firstNeighbor, secondNeighbor, thirdNeighbor] = await seedRankedTopics(
        testUser.id,
        baseEmbedding,
        [0, 0.04, 0.08, 0.12],
        tag,
      )

      const result = await getTopicIds({
        similar_topic_id: sourceId,
        sort: 'relevance',
        limit: 10,
      })
      expect(result.results.map(topic => topic.id)).toEqual([firstNeighbor, secondNeighbor])
      expect(result.results.map(topic => topic.id)).not.toContain(sourceId)
      expect(result.results.map(topic => topic.id)).not.toContain(thirdNeighbor)
      expect(result.page_info.has_next_page).toBe(false)
    } finally {
      restore()
    }
  })
})
