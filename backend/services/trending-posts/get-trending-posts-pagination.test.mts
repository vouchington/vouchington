import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { insertTestTopic } from '@voucha/test-helpers/entities/topics'
import { insertScoredPostTopicCategoryRelation } from '@voucha/test-helpers/entities/entity-relations-posts'
import { createTrendingPostData } from '@voucha/test-helpers/entities/trending-posts'
import { deleteTestPost } from '@voucha/test-helpers/entities/posts'
import { getTrendingPosts } from './get-trending-posts.mts'

describe('getTrendingPosts pagination', () => {
  it('preserves score ordering and cursor boundaries at one fixed instant', async () => {
    const referenceTime = new Date('2024-03-01T00:00:00.000Z')
    const createdAt = new Date('2024-02-29T23:00:00.000Z')
    const posts = await Promise.all(
      [3, 2, 1].map(votesScoreUp => createTrendingPostData({ votesScoreUp, createdAt })),
    )
    const postIds = posts.map(post => post.postId)

    const namespace = randomUUID()
    const topicId = await insertTestTopic({
      name: `Trending ${namespace}`,
      slug: `trending-${namespace}`,
      createdById: posts[0]!.userId,
    })
    for (const { postId, userId } of posts) {
      await insertScoredPostTopicCategoryRelation(postId, topicId, userId)
    }
    const minScore = 0.5

    const page1 = await getTrendingPosts(
      { timeRange: 'day', limit: 2, minScore, topicId },
      referenceTime,
    )

    expect(page1.results.length).toBe(2)
    expect(page1.results.map(row => row.id)).toEqual(postIds.slice(0, 2))
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).toBeTruthy()

    const page2 = await getTrendingPosts(
      {
        timeRange: 'day',
        limit: 2,
        after: page1.page_info.end_cursor!,
        minScore,
        topicId,
      },
      referenceTime,
    )

    expect(page2.results.length).toBeLessThanOrEqual(2)
    expect(page2.page_info).toBeDefined()
    expect(page2.results.map(row => row.id)).toEqual([postIds[2]])
    expect(
      page2.results.filter(row => page1.results.some(previous => previous.id === row.id)),
    ).toEqual([])

    const fullResult = await getTrendingPosts(
      { timeRange: 'day', limit: 100, minScore, topicId },
      referenceTime,
    )
    const allIds = fullResult.results.map(row => row.id)
    for (const id of postIds) expect(allIds).toContain(id)

    const positions = postIds.map(id => allIds.indexOf(id))
    expect(positions[0]).toBeLessThan(positions[1])
    expect(positions[1]).toBeLessThan(positions[2])

    const absentBoundary = await getTrendingPosts(
      {
        timeRange: 'day',
        limit: 2,
        minScore,
        topicId,
        after: encodeCursor({ score: 1.5, id: topicId }),
      },
      referenceTime,
    )
    expect(absentBoundary.results.map(row => row.id)).toEqual([postIds[2]])

    await deleteTestPost(postIds[1]!)
    const deletedBoundary = await getTrendingPosts(
      {
        timeRange: 'day',
        limit: 2,
        minScore,
        topicId,
        after: page1.page_info.end_cursor!,
      },
      referenceTime,
    )
    expect(deletedBoundary.results.map(row => row.id)).toEqual([postIds[2]])
  })
})
