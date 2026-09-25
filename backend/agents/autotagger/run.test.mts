import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  addDummyEmbeddingToPost,
  createTestPost,
  createTestTopic,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
} from '@voucha/test-helpers'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { createFakeStructuredDecisionClient } from '@voucha/test-helpers/agents/autotagger/fake-structured-decision-client'
import { runAutotaggerOnPost } from './run.mts'

// Eligibility gating (enabled, tier-zero max_topics) lives in the caller (processAutotaggerPost,
// covered by process-autotagger.test.mts); this file only exercises runAutotaggerOnPost's own
// candidate-search-then-dispatch logic.

async function addMatchingTopicEmbedding(topicId: string, embedding: number[]) {
  const inputSha256 = createHash('sha256').update(topicId).digest()
  await updateTopicEmbeddingData({ topicId, inputSha256, embedding, tokens: 10 })
}

describe('runAutotaggerOnPost', () => {
  it('returns null without dispatching when max_topics is 0, even with a matching candidate available', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const topic = await createTestTopic({ user })
    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToPost(post.id, { embedding })
    await addMatchingTopicEmbedding(topic.id, makeNearbyEmbedding(embedding, 0.01))
    const fake = createFakeStructuredDecisionClient()

    // searchTopicsByPostEmbedding clamps its limit up to 1 internally (by-post-embedding.mts's
    // safeLimit), so without runAutotaggerOnPost's own `maxCandidates === 0` early return, this
    // real, embedding-matching candidate would still be found and dispatched.
    const result = await runAutotaggerOnPost(
      post,
      { max_topics: 0 },
      { createClient: fake.createClient },
    )

    expect(result).toBeNull()
    expect(fake.decide).not.toHaveBeenCalled()
  })

  it('returns null when the post has no embedding to search candidates against', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const fake = createFakeStructuredDecisionClient()

    const result = await runAutotaggerOnPost(
      post,
      { max_topics: 5 },
      { createClient: fake.createClient },
    )

    expect(result).toBeNull()
    expect(fake.decide).not.toHaveBeenCalled()
  })

  it('dispatches against embedding-similar topic candidates and returns the applied topic ids', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })
    const topic = await createTestTopic({ user })

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToPost(post.id, { embedding })
    await addMatchingTopicEmbedding(topic.id, makeNearbyEmbedding(embedding, 0.01))

    const fake = createFakeStructuredDecisionClient({ [topic.id]: 0.95 })
    const result = await runAutotaggerOnPost(
      post,
      { max_topics: 10 },
      { createClient: fake.createClient },
    )

    // .toContain, not exact equality: the shared, parallel-running test database can surface other
    // concurrently seeded topics within embedding-similarity range of this post.
    expect(fake.decide).toHaveBeenCalledTimes(1)
    expect(result?.topics_added).toContain(topic.id)
  })
})
