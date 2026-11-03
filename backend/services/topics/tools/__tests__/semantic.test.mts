import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest'
import { toolsSearchTopicsSemantic } from '../semantic.mts'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { createHash } from 'node:crypto'
import {
  createTestUser,
  createTestTopic,
  makeNearbyEmbedding,
  makeRandomEmbedding,
} from '@voucha/test-helpers'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
import { getTopicByAny } from '@services/topics/get'
import * as bedrockRequest from '../../../bedrock-embeddings/single/request.mts'

let queryEmbedding: number[]

// The query embedding is cached in Valkey for a day, so every case uses a unique query.
function uniqueQuery(baseQuery: string): string {
  return `${baseQuery} ${crypto.randomUUID()}`
}

function uniqueTopicName(baseName: string): string {
  return `${baseName} ${crypto.randomUUID().slice(0, 8)}`
}

async function seedTopicEmbeddings(topicIds: string[], inputSeed: string): Promise<void> {
  await Promise.all(
    topicIds.map(topicId =>
      updateTopicEmbeddingData({
        topicId,
        inputSha256: createHash('sha256').update(`${inputSeed}:${topicId}`).digest(),
        embedding: makeNearbyEmbedding(queryEmbedding),
        tokens: 10,
      }),
    ),
  )
}

describe('toolsSearchTopicsSemantic', () => {
  beforeEach(() => {
    queryEmbedding = makeRandomEmbedding()
    vi.spyOn(bedrockRequest, 'createBedrockEmbedding').mockResolvedValue({
      embedding: queryEmbedding,
      tokens: 5,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('limits results to specified limit', async () => {
    const user = await createTestUser()
    const topics = await Promise.all([
      createTestTopic({ user: user, name: uniqueTopicName('Topic A') }),
      createTestTopic({ user: user, name: uniqueTopicName('Topic B') }),
      createTestTopic({ user: user, name: uniqueTopicName('Topic C') }),
    ])

    await seedTopicEmbeddings(
      topics.map(t => t.id),
      'semantic-limit',
    )

    const results = await toolsSearchTopicsSemantic(uniqueQuery('topic limit coverage'), 2)
    expect(results).toHaveLength(2)
  })

  it('respects max limit of 25', async () => {
    const user = await createTestUser()
    const topics = await Promise.all(
      Array.from({ length: 26 }, (_, index) =>
        createTestTopic({ user: user, name: uniqueTopicName(`Cap Topic ${index}`) }),
      ),
    )

    await seedTopicEmbeddings(
      topics.map(t => t.id),
      'semantic-max-limit',
    )

    const results = await toolsSearchTopicsSemantic(uniqueQuery('topic max limit coverage'), 100)
    expect(results.length).toBe(25)
  })

  it('excludes merged topics from semantic search results', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: admin, name: uniqueTopicName('Merged Source') })
    const destination = await createTestTopic({
      user: admin,
      name: uniqueTopicName('Merged Destination'),
    })

    await seedTopicEmbeddings([source.id, destination.id], 'semantic-merged-filter')

    const fullSource = await getTopicByAny(source.id)
    const fullDestination = await getTopicByAny(destination.id)
    if (!fullSource || !fullDestination) throw new Error('Test topics not found')

    await mergeTopicAliases(admin, fullSource, fullDestination)

    const results = await toolsSearchTopicsSemantic(uniqueQuery('merged filter coverage'), 25)
    const ids = results.map(r => r.id)
    expect(ids).toContain(destination.id)
    expect(ids).not.toContain(source.id)
  })
})
