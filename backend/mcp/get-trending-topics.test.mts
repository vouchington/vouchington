import { beforeAll, describe, expect, it } from 'vitest'
import getTrendingTopicsTool from './get-trending-topics.mts'
import { createTestUser } from '@voucha/test-helpers'
import { createTrendingTopicData } from '@voucha/test-helpers/entities/trending-topics'
import type { PrivateUser } from '@services/users/types'

describe('get_trending_topics tool — real DB', () => {
  let user: PrivateUser
  let trendingTopicId: string

  beforeAll(async () => {
    user = await createTestUser()

    // Very high score so this topic always lands in the tool's top-25 results.
    // Trending topics sort by score DESC, id DESC — ties break by newest UUIDv7
    // first. A score of 10200 (2000*5 + 200) exceeds typical accumulated test
    // data, and even if many prior runs created topics at this score, the
    // newest one (ours) wins the tiebreaker.
    const data = await createTrendingTopicData({
      postTagCount: 2000,
      rssItemTagCount: 200,
      netVote: 1,
    })
    trendingTopicId = data.topicId
  })

  it('returns trending topics', async () => {
    const execute = getTrendingTopicsTool.function(user)
    const result = await execute({})

    expect(result.success).toBe(true)
    expect(result.time_range).toBe('week')
    expect(Array.isArray(result.results)).toBe(true)
    for (const r of result.results) {
      expect(r).toHaveProperty('id')
      expect(r).toHaveProperty('trending_score')
      expect(r).toHaveProperty('post_tag_count')
      expect(r).toHaveProperty('rss_item_tag_count')
    }
  })

  it('includes the high-score test topic in weekly results', async () => {
    const execute = getTrendingTopicsTool.function(user)
    const result = await execute({ time_range: 'week', limit: 25 })

    expect(result.success).toBe(true)
    const found = result.results.find(r => r.id === trendingTopicId)
    expect(found).toBeDefined()
    expect(found!.trending_score).toBeGreaterThan(0)
  })

  it('respects time_range parameter', async () => {
    const execute = getTrendingTopicsTool.function(user)
    const result = await execute({ time_range: 'day' })

    expect(result.success).toBe(true)
    expect(result.time_range).toBe('day')
  })

  it('respects limit parameter', async () => {
    const execute = getTrendingTopicsTool.function(user)
    const result = await execute({ limit: 3 })

    expect(result.success).toBe(true)
    expect(result.results.length).toBeLessThanOrEqual(3)
  })
})
