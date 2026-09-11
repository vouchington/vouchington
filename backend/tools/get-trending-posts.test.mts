import { beforeAll, describe, expect, it } from 'vitest'
import getTrendingPostsTool from './get-trending-posts.mts'
import { createTestUser } from '@voucha/test-helpers'
import { createTrendingPostData } from '@voucha/test-helpers/entities/trending-posts'
import type { PrivateUser } from '@services/users/types'
import { VALID_TRENDING_POST_TYPES, VALID_TRENDING_TIME_RANGES } from '@ts-shared/feed-capabilities'

describe('get_trending_posts tool — real DB', () => {
  let user: PrivateUser
  let trendingPostId: string

  beforeAll(async () => {
    user = await createTestUser()

    // Very high score so this post always lands in the tool's top-10 results.
    // Trending posts use a 3-day half-life time decay, so accumulated data
    // from prior runs rapidly loses score. A fresh post at 50k easily
    // outranks week-old posts that started at the same score.
    const data = await createTrendingPostData({ votesScoreUp: 50_000 })
    trendingPostId = data.postId
  })

  it('returns trending posts', async () => {
    const execute = getTrendingPostsTool.function(user)
    const result = await execute({})

    expect(result.success).toBe(true)
    expect(result.time_range).toBe('week')
    expect(Array.isArray(result.results)).toBe(true)
    for (const r of result.results) {
      expect(r).toHaveProperty('id')
      expect(r).toHaveProperty('trending_score')
    }
  })

  it('derives schema enums from the trending post catalog', () => {
    const parameters = getTrendingPostsTool.schema.parameters as {
      properties: Record<string, { enum?: unknown }>
    }
    const properties = parameters.properties

    expect(properties.time_range?.enum).toEqual([...VALID_TRENDING_TIME_RANGES])
    expect(properties.post_type?.enum).toEqual([...VALID_TRENDING_POST_TYPES])
  })

  it('includes the high-score test post in results', async () => {
    const execute = getTrendingPostsTool.function(user)
    const result = await execute({ time_range: 'week', limit: 10 })

    expect(result.success).toBe(true)
    const found = result.results.find(r => r.id === trendingPostId)
    expect(found).toBeDefined()
    expect(found!.trending_score).toBeGreaterThan(0)
  })

  it('respects post_type filter', async () => {
    const execute = getTrendingPostsTool.function(user)
    const result = await execute({ post_type: 'discussion', limit: 5 })

    expect(result.success).toBe(true)
    expect(result.results.length).toBeLessThanOrEqual(5)
  })

  it('respects time_range parameter', async () => {
    const execute = getTrendingPostsTool.function(user)
    const result = await execute({ time_range: 'month' })

    expect(result.success).toBe(true)
    expect(result.time_range).toBe('month')
  })
})
