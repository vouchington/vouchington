import { describe, expect, it, beforeEach, vi } from 'vitest'
import { toolsSearchTopicsSemantic } from '../semantic.mts'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { createHash } from 'node:crypto'
import {
  createTestUser,
  createTestTopic,
  makeNearbyEmbedding,
  makeRandomEmbedding,
} from '@voucha/test-helpers'
import { mergeTopicAliases } from '@services/topics/merge-aliases'
import { getTopicByAny } from '@services/topics/get'

const mockGetCachedSearchEmbedding = vi.fn<(query: string) => Promise<number[]>>()
let queryEmbedding: number[]

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
    mockGetCachedSearchEmbedding.mockReset().mockResolvedValue(queryEmbedding)
  })

  it('limits results to specified limit', { timeout: 30_000 }, async () => {
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

    const results = await toolsSearchTopicsSemantic('topic limit coverage', 2, {
      getCachedSearchEmbedding: mockGetCachedSearchEmbedding,
    })
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('respects max limit of 25', { timeout: 30_000 }, async () => {
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

    const results = await toolsSearchTopicsSemantic('topic max limit coverage', 100, {
      getCachedSearchEmbedding: mockGetCachedSearchEmbedding,
    })
    expect(results.length).toBe(25)
  })

  it('excludes merged topics from semantic search results', { timeout: 30_000 }, async () => {
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

    const results = await toolsSearchTopicsSemantic('merged filter coverage', 25, {
      getCachedSearchEmbedding: mockGetCachedSearchEmbedding,
    })
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(source.id)
  })
})
