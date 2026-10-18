import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { HOT_SORT_HALF_LIFE_SECONDS } from '@modules/feed-query-builders'
import { insertScoredPostTopicCategoryRelation } from '@voucha/test-helpers/entities/entity-relations-posts'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { getTrendingPosts } from './get-trending-posts.mts'

const DAY_MS = 24 * 60 * 60 * 1000

const boundaryCases = [
  { timeRange: 'day', reference: '2024-01-31T23:59:59.999Z' },
  { timeRange: 'day', reference: '2024-02-01T00:00:00.001Z' },
  { timeRange: 'week', reference: '2024-12-31T23:59:59.999Z' },
  { timeRange: 'week', reference: '2025-01-01T00:00:00.001Z' },
  { timeRange: 'month', reference: '2024-02-29T23:59:59.999Z' },
  { timeRange: 'month', reference: '2024-03-01T00:00:00.001Z' },
] as const

describe('getTrendingPosts reference clock', () => {
  it.each(boundaryCases)('uses one instant for $timeRange at $reference', async scenario => {
    const referenceTime = new Date(scenario.reference)
    const rangeDays = scenario.timeRange === 'day' ? 1 : scenario.timeRange === 'week' ? 7 : 30
    const cutoffTime = referenceTime.getTime() - rangeDays * DAY_MS
    const createdAt = [cutoffTime - 1, cutoffTime, cutoffTime + 1].map(ms => new Date(ms))
    const votesScoreUp = 100
    const fixtureOwners = new Map<string, string>()
    const fixtureTimes = new Map<string, Date>()
    const fixturePostIds = new Map<number, string>()

    const result = await withDominantPostFixtures(
      createdAt.map(timestamp => ({ votesScoreUp, createdAt: timestamp })),
      async postIds => {
        const owner = fixtureOwners.get(postIds[0]!)
        if (!owner) throw new Error('Fixture owner missing')
        const namespace = `${scenario.timeRange}-${scenario.reference}-${randomUUID()}`
        const topicId = await insertTestTopic({
          name: `Trending clock ${namespace}`,
          slug: `trending-clock-${namespace.replaceAll(/[^a-z0-9-]/gi, '-')}`.toLowerCase(),
          createdById: owner,
        })
        for (const postId of postIds) {
          const postOwner = fixtureOwners.get(postId)
          if (!postOwner) throw new Error(`Fixture owner missing for ${postId}`)
          await insertScoredPostTopicCategoryRelation(postId, topicId, postOwner)
        }

        const result = await getTrendingPosts(
          { timeRange: scenario.timeRange, limit: 10, topicId },
          referenceTime,
        )
        return { result, postIds }
      },
      {
        afterCreateForTest: async (fixture, ownedSpec) => {
          fixtureOwners.set(fixture.postId, fixture.userId)
          fixtureTimes.set(fixture.postId, ownedSpec.createdAt!)
          fixturePostIds.set(ownedSpec.createdAt!.getTime(), fixture.postId)
        },
      },
    )

    const { result: queryResult, postIds } = result
    expect(new Set(queryResult.results.map(row => row.id))).toEqual(
      new Set([fixturePostIds.get(cutoffTime)!, fixturePostIds.get(cutoffTime + 1)!]),
    )
    for (const row of queryResult.results) {
      const timestamp = fixtureTimes.get(row.id)!
      const ageSeconds = (referenceTime.getTime() - timestamp.getTime()) / 1000
      const expectedScore = votesScoreUp * 2 ** (-ageSeconds / HOT_SORT_HALF_LIFE_SECONDS)
      expect(row.trending_score).toBeCloseTo(expectedScore, 8)
    }
    expect(postIds).toHaveLength(3)
  })

  it('keeps day and week filtering anchored to the supplied instant', async () => {
    const referenceTime = new Date('2025-04-15T12:00:00.000Z')
    const fixtureOwners = new Map<string, string>()
    const timestamps = [
      new Date(referenceTime.getTime() - 48 * 60 * 60 * 1000),
      new Date(referenceTime.getTime() - 60 * 60 * 1000),
      new Date(referenceTime.getTime() - 6 * DAY_MS),
    ]
    const result = await withDominantPostFixtures(
      timestamps.map(createdAt => ({ votesScoreUp: 10_000, createdAt })),
      async postIds => {
        const owner = fixtureOwners.get(postIds[0]!)
        if (!owner) throw new Error('Fixture owner missing')
        const namespace = randomUUID()
        const topicId = await insertTestTopic({
          name: `Trending range ${namespace}`,
          slug: `trending-range-${namespace}`,
          createdById: owner,
        })
        for (const postId of postIds) {
          const postOwner = fixtureOwners.get(postId)
          if (!postOwner) throw new Error(`Fixture owner missing for ${postId}`)
          await insertScoredPostTopicCategoryRelation(postId, topicId, postOwner)
        }
        const day = await getTrendingPosts(
          { timeRange: 'day', limit: 100, minScore: 500, topicId },
          referenceTime,
        )
        const week = await getTrendingPosts(
          { timeRange: 'week', limit: 100, minScore: 500, topicId },
          referenceTime,
        )
        return { day, week, postIds }
      },
      {
        afterCreateForTest: async fixture => {
          fixtureOwners.set(fixture.postId, fixture.userId)
        },
      },
    )
    expect(result.day.results.some(row => row.id === result.postIds[0])).toBe(false)
    expect(result.day.results.some(row => row.id === result.postIds[1])).toBe(true)
    expect(result.week.results.some(row => row.id === result.postIds[2])).toBe(true)
  })

  it.each([new Date(Number.NaN), new Date(0xffffffffffff + 1), new Date(-1), new Date(0)])(
    'rejects a reference instant outside UUIDv7 bounds before querying: %s',
    async referenceTime => {
      await expect(getTrendingPosts({ timeRange: 'day', limit: 1 }, referenceTime)).rejects.toThrow(
        RangeError,
      )
    },
  )
})
