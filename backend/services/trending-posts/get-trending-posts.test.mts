import { describe, it, expect } from 'vitest'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'
import { getTrendingPosts } from './get-trending-posts.mts'
import { createTrendingPostData } from '@voucha/test-helpers/entities/trending-posts'

describe('getTrendingPosts - with test data', () => {
  it('treats a far-future UUIDv7 post as newly created', async () => {
    const votesScoreUp = 2_000_000_000
    const { postId } = await createTrendingPostData({
      votesScoreUp,
      postType: 'data_point',
      createdAt: new Date('9999-12-31T23:59:59.000Z'),
    })

    try {
      const result = await getTrendingPosts({
        timeRange: 'day',
        postType: 'data_point',
        limit: 100,
        minScore: votesScoreUp,
      })

      const found = result.results.find(row => row.id === postId)
      expect(found?.trending_score).toBe(votesScoreUp)
    } finally {
      await deleteTestPost(postId)
    }
  })

  it('should return a trending post with positive vote score', async () => {
    const { postId } = await createTrendingPostData({ votesScoreUp: 500 })

    const result = await getTrendingPosts({
      timeRange: 'day',
      limit: 100,
      minScore: 100,
    })

    const found = result.results.find(r => r.id === postId)
    expect(found).toBeDefined()
    expect(found?.trending_score).toBeGreaterThan(0)
    // Score should be close to votes_score_net (500) for very recent posts
    expect(found?.trending_score).toBeLessThanOrEqual(500)
  })

  it('should exclude posts with zero votes', async () => {
    const { postId } = await createTrendingPostData({ votesScoreUp: 0 })

    const result = await getTrendingPosts({
      timeRange: 'day',
      limit: 100,
    })

    const found = result.results.find(r => r.id === postId)
    expect(found).toBeUndefined()
  })
})

describe('getTrendingPosts - excluded post types', () => {
  it('should exclude topic_recommendation posts', async () => {
    const { postId } = await createTrendingPostData({
      votesScoreUp: 5,
      postType: 'topic_recommendation',
    })

    const result = await getTrendingPosts({
      timeRange: 'day',
      limit: 100,
    })

    const found = result.results.find(r => r.id === postId)
    expect(found).toBeUndefined()
  })
})

describe('getTrendingPosts - post type filter', () => {
  it('should filter by post_type', async () => {
    const { postId: reviewPostId } = await createTrendingPostData({
      votesScoreUp: 3,
      postType: 'review',
    })
    const { postId: discussionPostId } = await createTrendingPostData({
      votesScoreUp: 3,
      postType: 'discussion',
    })

    const result = await getTrendingPosts({
      timeRange: 'day',
      limit: 100,
      postType: 'review',
    })

    const foundReview = result.results.find(r => r.id === reviewPostId)
    const foundDiscussion = result.results.find(r => r.id === discussionPostId)

    expect(foundReview).toBeDefined()
    expect(foundDiscussion).toBeUndefined()
  })
})

describe('getTrendingPosts - min score threshold', () => {
  it('should filter posts by minimum score', async () => {
    const { postId: highScoreId } = await createTrendingPostData({ votesScoreUp: 50 })
    const { postId: lowScoreId } = await createTrendingPostData({ votesScoreUp: 1 })

    // High score post should appear with a reasonable minScore
    const result = await getTrendingPosts({
      timeRange: 'day',
      limit: 100,
      minScore: 10,
    })

    const foundHigh = result.results.find(r => r.id === highScoreId)
    const foundLow = result.results.find(r => r.id === lowScoreId)

    expect(foundHigh).toBeDefined()
    expect(foundLow).toBeUndefined()
  })
})

describe('getTrendingPosts - limit clamping', () => {
  it('should clamp limit 0 to 1', async () => {
    const result = await getTrendingPosts({
      timeRange: 'day',
      limit: 0,
    })

    expect(result.results.length).toBeLessThanOrEqual(1)
    expect(result.page_info).toBeDefined()
  })

  it('should clamp limit above 100 to 100', async () => {
    const result = await getTrendingPosts({
      timeRange: 'day',
      limit: 999,
    })

    expect(result.results.length).toBeLessThanOrEqual(100)
  })
})
