import { describe, expect, it } from 'vitest'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import {
  createRandomString,
  createTestUserDirect,
  deleteTestPost,
  insertTestPost,
  setPostVotesScoreUp,
} from '@voucha/test-helpers'
import { getPostIds } from '../get-ids.mts'
import type { PostSearchOptions } from '../types.mts'

describe('getPostIds hot-score pagination', () => {
  it('paginates finite scores when a post has a far-future UUIDv7 timestamp', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create hot-score test user')

    const suffix = createRandomString(10)
    const futureId = getMinUUIDv7ForDate(new Date('9999-12-31T23:59:59.000Z'))
    const [futurePostId, currentPostId] = await Promise.all([
      insertTestPost({
        id: futureId,
        title: `Future hot post ${suffix}`,
        slug: `future-hot-post-${suffix}`,
        createdById: user.id,
        markdown: `Future hot post ${suffix}`,
        postType: 'topic_recommendation',
      }),
      insertTestPost({
        title: `Current hot post ${suffix}`,
        slug: `current-hot-post-${suffix}`,
        createdById: user.id,
        markdown: `Current hot post ${suffix}`,
        postType: 'topic_recommendation',
      }),
    ])
    try {
      await Promise.all([
        setPostVotesScoreUp(futurePostId, 100),
        setPostVotesScoreUp(currentPostId, 50),
      ])

      const options: PostSearchOptions = {
        user_id: user.id,
        include_topic_recommendations: true,
        post_types: ['topic_recommendation'],
        sort: 'hot',
        time_range: 'all',
        limit: 1,
      }
      const page1 = await getPostIds(undefined, options)

      expect(page1.results.map(result => result.id)).toEqual([futurePostId])
      expect(page1.page_info.has_next_page).toBe(true)
      expect(page1.page_info.end_cursor).toEqual(expect.any(String))
      const cursor = decodeUuidCursor(
        page1.page_info.end_cursor!,
        isScoreCursor,
        'Expected a hot-score cursor',
      )
      expect(cursor.score).toBe(100)
      expect(Number.isFinite(cursor.score)).toBe(true)

      const page2 = await getPostIds(undefined, {
        ...options,
        after: page1.page_info.end_cursor ?? undefined,
      })

      expect(page2.results.map(result => result.id)).toEqual([currentPostId])
      expect(page2.results[0]?.id).not.toBe(page1.results[0]?.id)
    } finally {
      await Promise.all([deleteTestPost(futurePostId), deleteTestPost(currentPostId)])
    }
  })
})
