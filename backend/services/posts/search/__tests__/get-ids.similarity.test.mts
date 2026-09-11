import { it, expect, beforeAll, describe } from 'vitest'
import { createHash } from 'node:crypto'
import {
  createTestUser,
  insertTestPost,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
  updatePostEmbeddingData,
} from '@voucha/test-helpers'
import { getPostIds } from '../get-ids.mts'
import type { PrivateUser } from '@services/users/types'

describe('get-ids (similarity search)', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('similar_post_id with sort=relevance returns simple cursor and does not 500', async () => {
    // similar_post_id without text/semantic search: the query builder omits
    // ranking_score (buildPostRankingScoreExpression returns null), so the
    // cursor must be a simple id cursor — not a ranking cursor.
    const sharedEmbedding = makeRandomEmbedding()
    const inputSha256 = createHash('sha256').update('similar-post-test').digest()
    const suffix = `SimPost${Date.now()}`

    const sourcePost = await insertTestPost({
      title: `${suffix} Source`,
      slug: `sim-src-${Date.now()}-${Math.random()}`,
      markdown: 'source post for similarity test',
      createdById: user.id,
    })
    await updatePostEmbeddingData({
      postId: sourcePost,
      inputSha256,
      embedding: sharedEmbedding,
      tokens: 10,
    })

    const siblingIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const id = await insertTestPost({
        title: `${suffix} Sibling ${i}`,
        slug: `sim-sib-${i}-${Date.now()}-${Math.random()}`,
        markdown: `sibling post ${i} for similarity test`,
        createdById: user.id,
      })
      await updatePostEmbeddingData({
        postId: id,
        inputSha256,
        embedding: sharedEmbedding,
        tokens: 10,
      })
      siblingIds.push(id)
    }

    // Paginate with limit=1 to exercise cursor encode/decode across pages.
    // This verifies neither the encode nor decode path throws a
    // "ranking_score missing" 500 when using similarity-only relevance.
    const found = new Set<string>()
    let after: string | undefined
    let iterations = 0

    while (iterations < 20) {
      const result = await getPostIds(user, {
        similar_post_id: sourcePost,
        sort: 'relevance',
        limit: 1,
        after,
      })

      result.results.forEach(r => found.add(r.id))

      if (!result.page_info.has_next_page) break
      expect(result.page_info.end_cursor).toBeTruthy()
      after = result.page_info.end_cursor ?? undefined
      iterations++
    }

    // All 3 siblings should have been found across pages without a 500
    expect(found.has(siblingIds[0]!)).toBe(true)
    expect(found.has(siblingIds[1]!)).toBe(true)
    expect(found.has(siblingIds[2]!)).toBe(true)
  })

  it('similar_post_id with no embedding on source returns empty without 500', async () => {
    // Source with no embedding: the similar_post_embedding CTE returns no
    // rows, so the CROSS JOIN produces 0 result rows.  The call must return
    // cleanly — not throw "ranking_score missing from query result".
    const bareSource = await insertTestPost({
      title: `BareSource ${Math.random()}`,
      slug: `bare-src-${Date.now()}-${Math.random()}`,
      markdown: 'bare source post with no embedding',
      createdById: user.id,
    })

    const result = await getPostIds(user, {
      similar_post_id: bareSource,
      sort: 'relevance',
      limit: 5,
    })
    expect(result.results).toHaveLength(0)
    expect(result.page_info.has_next_page).toBe(false)
  })

  it('semantic_search_query with cache-seeded embedding uses ranking cursor and finds matching post', async () => {
    // Covers the getCachedSearchEmbedding call in get-ids.mts without Bedrock:
    // seedSearchEmbeddingCache pre-populates the Valkey cache so the call
    // returns the pre-seeded embedding instead of hitting AWS Bedrock.
    const sharedEmbedding = makeRandomEmbedding()
    const inputSha256 = createHash('sha256').update('semantic-post-cache-test').digest()
    const testQuery = `semantic-post-cache-test-${Date.now()}-${Math.random()}`

    await seedSearchEmbeddingCache(testQuery, sharedEmbedding)

    const postId = await insertTestPost({
      title: `SemanticCachePost ${Math.random()}`,
      slug: `sem-cache-post-${Date.now()}-${Math.random()}`,
      markdown: 'test post for semantic cache coverage',
      createdById: user.id,
    })
    await updatePostEmbeddingData({
      postId,
      inputSha256,
      embedding: sharedEmbedding,
      tokens: 10,
    })

    const result = await getPostIds(user, {
      semantic_search_query: testQuery,
      sort: 'relevance',
      limit: 5,
    })

    expect(result.results.some(r => r.id === postId)).toBe(true)
  })
})
