import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertEntityRelation,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getRecommendedRssFeeds } from './get-recommendations.mts'
import { recommendedRssFeedsWorkConfig } from './work-limits.mts'

const FOLLOW_RSS_FEED = 'relation__user__follow__rss_feed'

describe('collaborative RSS recommendation caps', () => {
  it('seeds only from the newest feeds the viewer follows', async () => {
    const [viewer, olderNeighbor, newerNeighbor] = await createUsers(3)
    const [olderSeed, newerSeed, olderRecommendation, newerRecommendation] = await createFeeds(4)
    await follow(viewer.id, olderSeed)
    await follow(viewer.id, newerSeed)
    await follow(olderNeighbor.id, olderSeed)
    await follow(olderNeighbor.id, olderRecommendation)
    await follow(newerNeighbor.id, newerSeed)
    await follow(newerNeighbor.id, newerRecommendation)

    expect(await collaborativeIds(viewer.id)).toEqual(
      expect.arrayContaining([olderRecommendation, newerRecommendation]),
    )

    onTestFinished(
      overrideDynamicConfigFieldsForTest(recommendedRssFeedsWorkConfig, {
        collaborative_viewer_feed_limit: 1,
      }),
    )
    const ids = await collaborativeIds(viewer.id)
    expect(ids).toContain(newerRecommendation)
    expect(ids).not.toContain(olderRecommendation)
  })

  it('reads only the newest co-followers of each seed feed', async () => {
    const [viewer, olderNeighbor, newerNeighbor] = await createUsers(3)
    const [seed, olderRecommendation, newerRecommendation] = await createFeeds(3)
    await follow(viewer.id, seed)
    await follow(olderNeighbor.id, seed)
    await follow(olderNeighbor.id, olderRecommendation)
    await follow(newerNeighbor.id, seed)
    await follow(newerNeighbor.id, newerRecommendation)

    onTestFinished(
      overrideDynamicConfigFieldsForTest(recommendedRssFeedsWorkConfig, {
        collaborative_co_follower_limit: 1,
      }),
    )
    const ids = await collaborativeIds(viewer.id)
    expect(ids).toContain(newerRecommendation)
    expect(ids).not.toContain(olderRecommendation)
  })

  it("reads only each co-follower's newest follows", async () => {
    const [viewer, neighbor] = await createUsers(2)
    const [seed, olderRecommendation, newerRecommendation] = await createFeeds(3)
    await follow(viewer.id, seed)
    await follow(neighbor.id, seed)
    await follow(neighbor.id, olderRecommendation)
    await follow(neighbor.id, newerRecommendation)

    expect(await collaborativeIds(viewer.id)).toEqual(
      expect.arrayContaining([olderRecommendation, newerRecommendation]),
    )

    onTestFinished(
      overrideDynamicConfigFieldsForTest(recommendedRssFeedsWorkConfig, {
        collaborative_co_follower_feed_limit: 1,
      }),
    )
    const ids = await collaborativeIds(viewer.id)
    expect(ids).toContain(newerRecommendation)
    expect(ids).not.toContain(olderRecommendation)
  })
})

async function collaborativeIds(viewerId: string): Promise<string[]> {
  const { results } = await getRecommendedRssFeeds(viewerId, {
    limit: 100,
    source: 'collaborative',
  })
  return results.map(result => result.id)
}

async function createUsers(count: number) {
  return Promise.all(Array.from({ length: count }, () => createTestUser()))
}

async function createFeeds(count: number): Promise<string[]> {
  const author = await createTestUser({ administrator: true })
  return Promise.all(
    Array.from({ length: count }, async () => {
      const suffix = crypto.randomUUID()
      const topicId = await insertTestTopic({
        name: `RSS cap ${suffix}`,
        slug: `rss-cap-${suffix}`,
        createdById: author.id,
      })
      return insertTestRssFeed({ topicId, title: `RSS cap feed ${suffix}` })
    }),
  )
}

async function follow(userId: string, feedId: string): Promise<void> {
  await insertEntityRelation(FOLLOW_RSS_FEED, userId, feedId)
}
