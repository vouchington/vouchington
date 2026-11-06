import { describe, expect, it } from 'vitest'
import { createTestPostId } from '@voucha/test-helpers/entities/post-ids'
import {
  createRandomString,
  deleteTestPost,
  createTestUserDirect,
  insertTestPost,
  setTestPostVoteScores,
} from '@voucha/test-helpers'
import { getPostIds } from '../get-ids.mts'

describe('hot post search', () => {
  it('ranks by confidence, excludes nonpositive support and paginates; new search still includes it', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create hot-score test user')
    const suffix = createRandomString(10)
    const createdAt = new Date('9999-12-31T23:59:59.000Z')
    const ids: string[] = []
    try {
      for (const name of ['confidence', 'net', 'zero', 'negative']) {
        const postId = createTestPostId(createdAt)
        ids.push(postId)
        await insertTestPost({
          id: postId,
          title: `${name} ${suffix}`,
          slug: `hot-${name}-${suffix}`,
          markdown: 'hot score fixture',
          createdById: user.id,
          postType: 'topic_recommendation',
          createdAt,
        })
      }
      await Promise.all([
        setTestPostVoteScores(ids[0]!, 5, 0),
        setTestPostVoteScores(ids[1]!, 100, 90),
        setTestPostVoteScores(ids[2]!, 1, 1),
        setTestPostVoteScores(ids[3]!, 1, 2),
      ])
      const options = {
        user_id: user.id,
        include_topic_recommendations: true,
        post_types: ['topic_recommendation'] as const,
        time_range: 'all' as const,
      }
      const page1 = await getPostIds(undefined, {
        ...options,
        post_types: [...options.post_types],
        sort: 'hot',
        limit: 1,
      })
      expect(page1.results.map(row => row.id)).toEqual([ids[0]])
      expect(page1.page_info.has_next_page).toBe(true)
      const page2 = await getPostIds(undefined, {
        ...options,
        post_types: [...options.post_types],
        sort: 'hot',
        limit: 1,
        after: page1.page_info.end_cursor!,
      })
      expect(page2.results.map(row => row.id)).toEqual([ids[1]])
      expect(page2.page_info.has_next_page).toBe(false)
      const recent = await getPostIds(undefined, {
        ...options,
        post_types: [...options.post_types],
        sort: 'new',
        limit: 10,
      })
      expect(recent.results.map(row => row.id).toSorted()).toEqual(ids.toSorted())
    } finally {
      await Promise.all(ids.map(id => deleteTestPost(id)))
    }
  })
})
