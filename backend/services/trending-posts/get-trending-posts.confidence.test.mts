import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUserDirect,
  insertTestPost,
  insertTestTopic,
  insertScoredPostTopicCategoryRelation,
  setTestPostVoteScores,
} from '@voucha/test-helpers'
import { getTrendingPosts } from './get-trending-posts.mts'

describe('trending post confidence ranking', () => {
  it('ranks positive-net posts by confidence across pages and filters nonpositive net', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create trending test user')
    const suffix = createRandomString(10)
    const topicId = await insertTestTopic({
      name: `Hot ${suffix}`,
      slug: `hot-${suffix}`,
      createdById: user.id,
    })
    const createdAt = new Date()
    const ids = await Promise.all(
      ['confidence', 'net', 'zero', 'negative'].map(name =>
        insertTestPost({
          title: `${name} ${suffix}`,
          slug: `trend-${name}-${suffix}`,
          markdown: 'trending fixture',
          createdById: user.id,
          createdAt,
        }),
      ),
    )
    await Promise.all([
      setTestPostVoteScores(ids[0]!, 5, 0),
      setTestPostVoteScores(ids[1]!, 100, 90),
      setTestPostVoteScores(ids[2]!, 1, 1),
      setTestPostVoteScores(ids[3]!, 1, 2),
      ...ids.map(id => insertScoredPostTopicCategoryRelation(id, topicId, user.id)),
    ])
    const instant = new Date(createdAt.getTime() + 1000)
    const options = { timeRange: 'day' as const, topicId, limit: 1, minScore: -1 }
    const first = await getTrendingPosts(options, instant)
    expect(first.results.map(row => row.id)).toEqual([ids[0]])
    expect(first.page_info.has_next_page).toBe(true)
    const second = await getTrendingPosts(
      { ...options, after: first.page_info.end_cursor! },
      instant,
    )
    expect(second.results.map(row => row.id)).toEqual([ids[1]])
    expect(second.page_info.has_next_page).toBe(false)
    expect((await getTrendingPosts({ ...options, minScore: 1 }, instant)).results).toEqual([])
  })
})
