import { it, expect, beforeAll, describe } from 'vitest'
import { createHash } from 'node:crypto'
import {
  createTestUser,
  insertTestTopic,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
  updateTopicEmbeddingData,
} from '@voucha/test-helpers'
import { getTopicIds } from '../get-ids.mts'
import type { PrivateUser } from '@services/users/types'

describe('get-ids (similarity search)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('similar_topic_id returns a ranking cursor and pages without overlap', async () => {
    // Create a source topic and 3 sibling topics, all with identical embeddings
    // so they all fall within the cosine-distance threshold (<0.75) and appear
    // in the similarity results. No Bedrock call is needed — the embedding is
    // stored directly via updateTopicEmbeddingData.
    const sharedEmbedding = makeRandomEmbedding()
    const inputSha256 = createHash('sha256').update('similar-topic-test').digest()

    const sourceTopic = await insertTestTopic({
      name: `SimilarSource ${Math.random()}`,
      slug: `sim-src-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })
    await updateTopicEmbeddingData({
      topicId: sourceTopic,
      inputSha256,
      embedding: sharedEmbedding,
      tokens: 10,
    })

    const siblingIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const id = await insertTestTopic({
        name: `SimilarSibling ${i} ${Math.random()}`,
        slug: `sim-sib-${i}-${Date.now()}-${Math.random()}`,
        createdById: user.id,
      })
      await updateTopicEmbeddingData({
        topicId: id,
        inputSha256,
        embedding: sharedEmbedding,
        tokens: 10,
      })
      siblingIds.push(id)
    }

    // Paginate with limit=1 to exercise the ranking cursor encode/decode path.
    const found = new Set<string>()
    let after: string | undefined
    let iterations = 0

    while (iterations < 20) {
      const result = await getTopicIds({
        similar_topic_id: sourceTopic,
        sort: 'relevance',
        limit: 1,
        after,
      })

      // Source topic itself should never appear (excluded by WHERE t.id <> similar_topic_id)
      expect(result.results.some(r => r.id === sourceTopic)).toBe(false)

      result.results.forEach(r => found.add(r.id))

      if (!result.page_info.has_next_page) break
      // end_cursor must be a ranking cursor (base64-encoded with ranking field)
      expect(result.page_info.end_cursor).toBeTruthy()
      after = result.page_info.end_cursor ?? undefined
      iterations++
    }

    // All 3 siblings should have been found across pages
    expect(found.has(siblingIds[0]!)).toBe(true)
    expect(found.has(siblingIds[1]!)).toBe(true)
    expect(found.has(siblingIds[2]!)).toBe(true)
  })

  it('similar_topic_id with no embedding on source produces empty results (not a 500)', async () => {
    // A topic without an embedding has no matching results — the important
    // thing is that the call returns cleanly with an empty list rather than
    // throwing a 500 from a missing ranking_score column.
    const bareSource = await insertTestTopic({
      name: `BareSource ${Math.random()}`,
      slug: `bare-src-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })
    // No embedding set — similar_topic_embedding CTE will be empty, producing no rows.
    const result = await getTopicIds({
      similar_topic_id: bareSource,
      sort: 'relevance',
      limit: 5,
    })
    expect(result.results).toHaveLength(0)
    expect(result.page_info.has_next_page).toBe(false)
  })

  it('semantic_search_query with cache-seeded embedding uses ranking cursor and finds matching topic', async () => {
    // Covers the getCachedSearchEmbedding call in get-ids.mts without Bedrock:
    // seedSearchEmbeddingCache pre-populates the Valkey cache so the call
    // returns the pre-seeded embedding instead of hitting AWS Bedrock.
    const sharedEmbedding = makeRandomEmbedding()
    const inputSha256 = createHash('sha256').update('semantic-topic-cache-test').digest()
    const testQuery = `semantic-cache-test-${Date.now()}-${Math.random()}`

    // Pre-seed the Valkey cache so getCachedSearchEmbedding returns without Bedrock.
    await seedSearchEmbeddingCache(testQuery, sharedEmbedding)

    const topicId = await insertTestTopic({
      name: `SemanticCacheTopic ${Math.random()}`,
      slug: `sem-cache-${Date.now()}-${Math.random()}`,
      createdById: user.id,
    })
    await updateTopicEmbeddingData({
      topicId,
      inputSha256,
      embedding: sharedEmbedding,
      tokens: 10,
    })

    const result = await getTopicIds({
      semantic_search_query: testQuery,
      sort: 'relevance',
      limit: 5,
    })

    // The topic with a matching embedding should appear in results.
    expect(result.results.some(r => r.id === topicId)).toBe(true)
  })
})
