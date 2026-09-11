import { expect, it, describe } from 'vitest'
import { getPostIds } from '../get-ids.mts'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  followUser,
  insertTestPost,
  insertTestReview,
} from '@voucha/test-helpers'

describe('get-ids.pagination-and-following.generated', () => {
  it('getPostIds throws HTTP 400 on invalid cursor format', async () => {
    await expect(
      getPostIds(undefined, {
        after: 'not-valid-base64!!!',
        limit: 10,
      }),
    ).rejects.toMatchObject({
      message: 'Invalid cursor for sort=new',
      status: 400,
    })
  })

  it('getPostIds throws HTTP 400 on wrong cursor type for sort=new', async () => {
    const scoreCursor = Buffer.from(JSON.stringify({ score: 42, id: 'test' })).toString('base64')

    await expect(
      getPostIds(undefined, {
        after: scoreCursor,
        sort: 'new',
        limit: 10,
      }),
    ).rejects.toMatchObject({
      message: 'Invalid cursor for sort=new',
      status: 400,
    })
  })

  it('getPostIds throws HTTP 400 on wrong cursor type for sort=best', async () => {
    const simpleCursor = Buffer.from(JSON.stringify({ id: 'test' })).toString('base64')

    await expect(
      getPostIds(undefined, {
        after: simpleCursor,
        sort: 'best',
        limit: 10,
      }),
    ).rejects.toMatchObject({
      message: 'Invalid cursor for sort=best',
      status: 400,
    })
  })

  it('getPostIds throws HTTP 400 on wrong cursor type for sort=relevance', async () => {
    const scoreCursor = Buffer.from(JSON.stringify({ score: 42, id: 'test' })).toString('base64')

    await expect(
      getPostIds(undefined, {
        after: scoreCursor,
        sort: 'relevance',
        limit: 10,
      }),
    ).rejects.toMatchObject({
      message: 'Invalid cursor for sort=relevance',
      status: 400,
    })
  })

  it('getPostIds throws HTTP 400 on primitive cursor value', async () => {
    const primitiveCursor = Buffer.from('42').toString('base64')

    await expect(
      getPostIds(undefined, {
        after: primitiveCursor,
        sort: 'new',
        limit: 10,
      }),
    ).rejects.toMatchObject({
      message: 'Invalid cursor for sort=new',
      status: 400,
    })
  })

  it('getPostIds throws HTTP 400 on malformed similar_rss_feed_item_id', async () => {
    await expect(
      getPostIds(undefined, {
        similar_rss_feed_item_id: 'not-a-uuid',
        limit: 10,
      }),
    ).rejects.toMatchObject({
      status: 400,
    })
  })

  it('getPostIds handles empty results', async () => {
    const user = await createTestUser()

    const result = await getPostIds(undefined, {
      user_id: user!.id,
      limit: 10,
    })

    expect(result.results).toEqual([])
    expect(result.page_info.has_next_page).toBe(false)
    expect(result.page_info.end_cursor).toBeNull()
    expect(result.page_info.start_cursor).toBeNull()
  })

  it('getPostIds end_cursor is null when no next page', async () => {
    const user = await createTestUser()
    await createTestPost({ user })

    const result = await getPostIds(undefined, {
      user_id: user!.id,
      limit: 100,
    })

    expect(result.page_info.has_next_page).toBe(false)
    expect(result.page_info.end_cursor).toBeNull()
  })

  it('getPostIds start_cursor is always set when results exist', async () => {
    const user = await createTestUser()
    await createTestPost({ user })

    const result = await getPostIds(undefined, {
      user_id: user!.id,
      limit: 10,
    })

    expect(result.results.length).toBeGreaterThan(0)
    expect(result.page_info.start_cursor).not.toBeNull()
    expect(typeof result.page_info.start_cursor).toBe('string')
  })

  it('getPostIds cursors are opaque and do not expose internal structure', async () => {
    const user = await createTestUser()
    const post = await createTestPost({ user })

    const result = await getPostIds(undefined, {
      user_id: user!.id,
      sort: 'best',
      limit: 10,
    })

    expect(result.page_info.start_cursor).toBeTruthy()
    expect(result.page_info.start_cursor!).not.toContain(post.id)
    expect(result.page_info.start_cursor).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it('getPostIds limit+1 overfetch works with max limit=100', async () => {
    const user = await createTestUser()

    // Create 101 posts in parallel batches of 20 to keep DB pool pressure low.
    // Uses insertTestPost (direct insert) to avoid entity-listener cascade slowdowns.
    const batchSize = 20
    for (let start = 0; start < 101; start += batchSize) {
      const count = Math.min(batchSize, 101 - start)
      await Promise.all(
        Array.from({ length: count }, (_, i) =>
          insertTestPost({
            title: `Overfetch Post ${start + i}`,
            slug: `overfetch-post-${crypto.randomUUID()}`,
            createdById: user!.id,
            markdown: 'test',
          }),
        ),
      )
    }

    const result = await getPostIds(undefined, {
      user_id: user!.id,
      limit: 100,
    })

    expect(result.page_info.has_next_page).toBe(true)
    expect(result.results.length).toBe(100)
    expect(result.page_info.end_cursor).not.toBeNull()
  }, 120_000)

  it('getPostIds sort=following_new places followed reviewers before newer unfollowed reviewers', async () => {
    const viewer = await createTestUser()
    const followedReviewer = await createTestUser()
    const unfollowedReviewer = await createTestUser()
    const topic = await createTestTopic()

    await followUser(viewer!, followedReviewer!)

    const followedReviewId = await insertTestReview({
      userId: followedReviewer!.id,
      topicRatings: [{ topicId: topic.id, rating: 5 }],
      title: `Followed Review ${Date.now()}`,
      markdown: 'followed reviewer content',
    })

    const unfollowedReviewId = await insertTestReview({
      userId: unfollowedReviewer!.id,
      topicRatings: [{ topicId: topic.id, rating: 4 }],
      title: `Unfollowed Review ${Date.now()}`,
      markdown: 'unfollowed reviewer content',
    })

    const result = await getPostIds(viewer!, {
      review_topic_ids: [topic.id],
      post_types: ['review'],
      sort: 'following_new',
      limit: 10,
    })

    const followedIndex = result.results.findIndex(post => post.id === followedReviewId)
    const unfollowedIndex = result.results.findIndex(post => post.id === unfollowedReviewId)

    expect(followedIndex).toBeGreaterThanOrEqual(0)
    expect(unfollowedIndex).toBeGreaterThanOrEqual(0)
    expect(followedIndex).toBeLessThan(unfollowedIndex)
  })

  it('getPostIds sort=following_new falls back to newest-first when viewer is logged out', async () => {
    const olderReviewer = await createTestUser()
    const newerReviewer = await createTestUser()
    const topic = await createTestTopic()
    const newerCreatedAt = new Date()
    const olderCreatedAt = new Date(newerCreatedAt.getTime() - 1_000)

    const olderReviewId = await insertTestReview({
      userId: olderReviewer!.id,
      topicRatings: [{ topicId: topic.id, rating: 5 }],
      title: `Older Review ${Date.now()}`,
      markdown: 'older review content',
      createdAt: olderCreatedAt,
    })

    const newerReviewId = await insertTestReview({
      userId: newerReviewer!.id,
      topicRatings: [{ topicId: topic.id, rating: 4 }],
      title: `Newer Review ${Date.now()}`,
      markdown: 'newer review content',
      createdAt: newerCreatedAt,
    })

    const result = await getPostIds(undefined, {
      review_topic_ids: [topic.id],
      post_types: ['review'],
      sort: 'following_new',
      limit: 10,
    })

    const olderIndex = result.results.findIndex(post => post.id === olderReviewId)
    const newerIndex = result.results.findIndex(post => post.id === newerReviewId)

    expect(olderIndex).toBeGreaterThanOrEqual(0)
    expect(newerIndex).toBeGreaterThanOrEqual(0)
    expect(newerIndex).toBeLessThan(olderIndex)
  })
})
