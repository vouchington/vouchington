import { expect, it, describe } from 'vitest'
import { searchTopicsByRssFeedItemEmbedding } from './by-rss-feed-item-embedding.mts'
import { addDummyEmbeddingToRssFeedItem } from '@voucha/test-helpers/entities/rss-feed-items'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { createHash } from 'node:crypto'
import {
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  makeRandomEmbedding,
} from '@voucha/test-helpers'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { getTopicByAny } from '@services/topics/get'

describe('by-rss-feed-item-embedding', () => {
  async function addMatchingTopicEmbedding(topicId: string, embedding: number[]) {
    const inputSha256 = createHash('sha256').update(topicId).digest()
    await updateTopicEmbeddingData({
      topicId,
      inputSha256,
      embedding,
      tokens: 10,
    })
  }

  it('returns topics similar to rss feed item embedding', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user: user })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToRssFeedItem(item.id, { embedding })
    await addMatchingTopicEmbedding(topic.id, embedding)

    const results = await searchTopicsByRssFeedItemEmbedding(item.id, 10)

    expect(results.map(r => r.id)).toContain(topic.id)
  })

  it('returns empty array when rss feed item has no embedding', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user: user })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)

    const results = await searchTopicsByRssFeedItemEmbedding(item.id, 10)

    expect(results).toEqual([])
  })

  it('result has correct structure', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user: user })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToRssFeedItem(item.id, { embedding })
    await addMatchingTopicEmbedding(topic.id, embedding)

    const results = await searchTopicsByRssFeedItemEmbedding(item.id, 10)

    const found = results.find(r => r.id === topic.id)
    expect(found).toBeDefined()
    expect(found).toHaveProperty('id')
    expect(found).toHaveProperty('name')
  })

  it('limits results to specified limit', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user: user })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToRssFeedItem(item.id, { embedding })

    await addMatchingTopicEmbedding((await createTestTopic({ user: user })).id, embedding)
    await addMatchingTopicEmbedding((await createTestTopic({ user: user })).id, embedding)
    await addMatchingTopicEmbedding((await createTestTopic({ user: user })).id, embedding)

    const results = await searchTopicsByRssFeedItemEmbedding(item.id, 2)

    expect(results.length).toEqual(2)
  })

  it('excludes merged topics from rss feed item embedding results', async () => {
    const admin = await createTestUser({ administrator: true })
    const feedTopic = await createTestTopic({ user: admin })
    const feedId = await createTestRssFeedWithTiming(feedTopic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)

    const source = await createTestTopic({ user: admin })
    const destination = await createTestTopic({ user: admin })

    const embedding = makeRandomEmbedding()
    await addDummyEmbeddingToRssFeedItem(item.id, { embedding })
    await addMatchingTopicEmbedding(source.id, embedding)
    await addMatchingTopicEmbedding(destination.id, embedding)

    const fullSource = await getTopicByAny(source.id)
    const fullDestination = await getTopicByAny(destination.id)
    if (!fullSource || !fullDestination) throw new Error('Test topics not found')

    await mergeTopicAliases(admin, fullSource, fullDestination)

    const results = await searchTopicsByRssFeedItemEmbedding(item.id, 25)
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(source.id)
    expect(ids).toContain(destination.id)
  })
})
