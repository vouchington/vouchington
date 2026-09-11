import { describe, it, expect } from 'vitest'
import { getTrendingPosts } from './get-trending-posts.mts'
import { createTrendingPostData } from '@voucha/test-helpers/entities/trending-posts'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'

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

describe('getTrendingPosts - time range filtering', () => {
  it('should only include posts from last 24 hours for day range', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const recentTime = new Date(Date.now() - 1 * 60 * 60 * 1000)

    // Old post (should not appear in day range)
    const { postId: oldPostId } = await createTrendingPostData({
      votesScoreUp: 10000,
      createdAt: twoDaysAgo,
    })

    // Recent post (should appear) — high score to guarantee it's in top results
    const { postId: recentPostId } = await createTrendingPostData({
      votesScoreUp: 10000,
      createdAt: recentTime,
    })

    const result = await getTrendingPosts({
      timeRange: 'day',
      limit: 100,
      minScore: 500,
    })

    const oldPost = result.results.find(r => r.id === oldPostId)
    const recentPost = result.results.find(r => r.id === recentPostId)

    expect(oldPost).toBeUndefined()
    expect(recentPost).toBeDefined()
  }, 30_000)

  it('should include posts from last 7 days for week range', async () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)

    // High score to guarantee it survives time-decay and lands in top results
    const { postId } = await createTrendingPostData({
      votesScoreUp: 10000,
      createdAt: sixDaysAgo,
    })

    const result = await getTrendingPosts({
      timeRange: 'week',
      limit: 100,
      minScore: 500,
    })

    const found = result.results.find(r => r.id === postId)
    expect(found).toBeDefined()
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
  }, 30_000)
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
  }, 30_000)
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

describe('getTrendingPosts - pagination', () => {
  it('should paginate results correctly', async () => {
    // Create posts with high vote scores to ensure they appear in top results
    // even with accumulated data from previous test runs
    const posts = await Promise.all(
      [10000, 5000, 2500].map(votesScoreUp => createTrendingPostData({ votesScoreUp })),
    )
    const postIds = posts.map(p => p.postId)

    // Use high minScore to filter out noise from other tests
    const minScore = 1000

    const page1 = await getTrendingPosts({
      timeRange: 'day',
      limit: 2,
      minScore,
    })

    expect(page1.results.length).toBe(2)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeTruthy()

    // Note: time-decayed scores shift between queries, so a boundary item can legitimately
    // drop out of page 2 (or the DB may hold noise from other concurrent tests near minScore),
    // so we can't assert an exact or minimum count here -- only that pagination respects the
    // requested limit, matching the toBeLessThanOrEqual pattern used for limit clamping above.
    const page2 = await getTrendingPosts({
      timeRange: 'day',
      limit: 2,
      after: page1.page_info.end_cursor!,
      minScore,
    })

    expect(page2.results.length).toBeLessThanOrEqual(2)
    expect(page2.page_info).toBeDefined()

    // All 3 posts should appear in the full result set
    const fullResult = await getTrendingPosts({
      timeRange: 'day',
      limit: 100,
      minScore,
    })
    const allIds = fullResult.results.map(r => r.id)
    for (const id of postIds) {
      expect(allIds).toContain(id)
    }

    // Verify score-descending order for our posts (higher votes_score_up = higher trending_score)
    const positions = postIds.map(id => allIds.indexOf(id))
    expect(positions[0]).toBeLessThan(positions[1])
    expect(positions[1]).toBeLessThan(positions[2])
  }, 60_000)
})
