import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest'
import { toolsSearchTopicsSemantic } from '../semantic.mts'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { createHash } from 'node:crypto'
import {
  createTestUser,
  createTestTopic,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
import { getTopicByAny } from '@services/topics/get'
import { topicsWorkConfig } from '../../work-limits.mts'
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

async function seedRankedTopics(
  user: Awaited<ReturnType<typeof createTestUser>>,
  distances: readonly number[],
  tag: string,
): Promise<string[]> {
  const orthogonal = makeOrthogonalUnitVector(queryEmbedding)
  const topics = await Promise.all(
    distances.map((_, index) =>
      createTestTopic({ user, name: uniqueTopicName(`${tag} ${index}`) }),
    ),
  )
  await Promise.all(
    topics.map((topic, index) =>
      updateTopicEmbeddingData({
        topicId: topic.id,
        inputSha256: createHash('sha256').update(`${tag}:${topic.id}`).digest(),
        embedding: makeEmbeddingAtDistance(queryEmbedding, orthogonal, distances[index]!),
        tokens: 10,
      }),
    ),
  )
  return topics.map(topic => topic.id)
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

  it('caps candidates at tools_semantic_topic_candidate_limit and orders nearest first', async () => {
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      tools_semantic_topic_candidate_limit: 2,
    })
    try {
      const user = await createTestUser()
      const [nearest, second, third] = await seedRankedTopics(
        user,
        [0.05, 0.1, 0.15],
        'candidate-window-cap',
      )

      const results = await toolsSearchTopicsSemantic(uniqueQuery('candidate window cap'), 10)
      expect(results.map(row => row.id)).toEqual([nearest, second])
      expect(results.map(row => row.id)).not.toContain(third)
    } finally {
      restore()
    }
  })

  it('excludes topics beyond the 0.75 distance threshold inside the k-nearest prefix', async () => {
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      tools_semantic_topic_candidate_limit: 3,
    })
    try {
      const user = await createTestUser()
      const [nearest, second, beyondCutoff] = await seedRankedTopics(
        user,
        [0.05, 0.1, 0.78],
        'distance-cutoff',
      )

      const results = await toolsSearchTopicsSemantic(uniqueQuery('distance cutoff'), 10)
      expect(results.map(row => row.id)).toEqual([nearest, second])
      expect(results.map(row => row.id)).not.toContain(beyondCutoff)
    } finally {
      restore()
    }
  })

  it('filters merged topics inside the k-nearest prefix before applying the k cap', async () => {
    const restore = overrideDynamicConfigFieldsForTest(topicsWorkConfig, {
      tools_semantic_topic_candidate_limit: 2,
    })
    try {
      const admin = await createTestUser({ administrator: true })
      const [mergedSource, second, third] = await seedRankedTopics(
        admin,
        [0.05, 0.1, 0.15],
        'merged-inside-prefix',
      )

      const fullSource = await getTopicByAny(mergedSource!)
      const fullDestination = await getTopicByAny(second!)
      if (!fullSource || !fullDestination) throw new Error('Test topics not found')

      await mergeTopicAliases(admin, fullSource, fullDestination)

      const results = await toolsSearchTopicsSemantic(uniqueQuery('merged inside prefix'), 10)
      expect(results.map(row => row.id)).toEqual([second, third])
      expect(results.map(row => row.id)).not.toContain(mergedSource)
    } finally {
      restore()
    }
  })
})
