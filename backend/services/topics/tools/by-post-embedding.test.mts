import { expect, it, describe } from 'vitest'
import { searchTopicsByPostEmbedding } from './by-post-embedding.mts'
import {
  addDummyEmbeddingToPost,
  createTestUser,
  createTestPost,
  createTestTopic,
  makeNearbyEmbedding,
  makeRandomEmbedding,
} from '@voucha/test-helpers'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { createHash } from 'node:crypto'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { getTopicByAny } from '@services/topics/get'

describe('by-post-embedding', () => {
  async function addMatchingTopicEmbedding(topicId: string, embedding: number[]) {
    const inputSha256 = createHash('sha256').update(topicId).digest()
    await updateTopicEmbeddingData({
      topicId,
      inputSha256,
      embedding,
      tokens: 10,
    })
  }

  it('returns topics similar to post embedding', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user: user })
    const topic = await createTestTopic({ user: user })

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToPost(post.id, { embedding })
    await addMatchingTopicEmbedding(topic.id, makeNearbyEmbedding(embedding, 0.01))

    const results = await searchTopicsByPostEmbedding(post.id, 10)

    expect(results.map(r => r.id)).toContain(topic.id)
  })

  it('returns empty array when post has no embedding', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user: user })

    const results = await searchTopicsByPostEmbedding(post.id, 10)

    expect(results).toEqual([])
  })

  it('result has correct structure', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user: user })
    const topic = await createTestTopic({ user: user })

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToPost(post.id, { embedding })
    await addMatchingTopicEmbedding(topic.id, makeNearbyEmbedding(embedding, 0.01))

    const results = await searchTopicsByPostEmbedding(post.id, 10)

    const found = results.find(r => r.id === topic.id)
    expect(found).toBeDefined()
    expect(found).toHaveProperty('id')
    expect(found).toHaveProperty('name')
  })

  it('limits results to specified limit', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user: user })
    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToPost(post.id, { embedding })

    await addMatchingTopicEmbedding(
      (await createTestTopic({ user: user })).id,
      makeNearbyEmbedding(embedding, 0.01),
    )
    await addMatchingTopicEmbedding(
      (await createTestTopic({ user: user })).id,
      makeNearbyEmbedding(embedding, 0.01),
    )
    await addMatchingTopicEmbedding(
      (await createTestTopic({ user: user })).id,
      makeNearbyEmbedding(embedding, 0.01),
    )

    const results = await searchTopicsByPostEmbedding(post.id, 2)

    expect(results.length).toEqual(2)
  })

  it('excludes merged topics from post embedding results', async () => {
    const admin = await createTestUser({ administrator: true })
    const post = await createTestPost({ user: admin })
    const source = await createTestTopic({ user: admin })
    const destination = await createTestTopic({ user: admin })

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToPost(post.id, { embedding })
    await addMatchingTopicEmbedding(source.id, makeNearbyEmbedding(embedding, 0.01))
    await addMatchingTopicEmbedding(destination.id, makeNearbyEmbedding(embedding, 0.01))

    const fullSource = await getTopicByAny(source.id)
    const fullDestination = await getTopicByAny(destination.id)
    if (!fullSource || !fullDestination) throw new Error('Test topics not found')

    await mergeTopicAliases(admin, fullSource, fullDestination)

    const results = await searchTopicsByPostEmbedding(post.id, 25)
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(source.id)
    expect(ids).toContain(destination.id)
  })
})
