import { describe, expect, it } from 'vitest'
import { decodeScopedScoreCursor, decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import { createTestUserDirect } from '@voucha/test-helpers'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { getPostIds } from '../get-ids.mts'
import type { PostSearchOptions } from '../types.mts'

describe('getPostIds hot-score pagination', () => {
  it('paginates finite scores when a post has a far-future UUIDv7 timestamp', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create hot-score test user')

    await withDominantPostFixtures(
      [
        {
          createdAt: new Date('9999-12-31T23:59:59.000Z'),
          votesScoreUp: 100,
          postType: 'topic_recommendation',
          createdById: user.id,
        },
        { votesScoreUp: 50, postType: 'topic_recommendation', createdById: user.id },
      ],
      async ([futurePostId, currentPostId]) => {
        const options: PostSearchOptions = {
          user_id: user.id,
          post_types: ['topic_recommendation'],
          sort: 'hot',
          time_range: 'all',
          limit: 1,
        }
        const page1 = await getPostIds(undefined, options)

        expect(page1.results.map(result => result.id)).toEqual([futurePostId])
        expect(page1.page_info.has_next_page).toBe(true)
        expect(page1.page_info.end_cursor).toEqual(expect.any(String))
        const cursor = decodeScopedScoreCursor(
          page1.page_info.end_cursor!,
          'post-hot-stable-2026',
          'Expected a hot-score cursor',
        )
        expect(cursor.score).toBeGreaterThan(0)
        expect(Number.isFinite(cursor.score)).toBe(true)
        expect(() =>
          decodeUuidCursor(page1.page_info.end_cursor!, isScoreCursor, 'Legacy cursor rejected'),
        ).toThrow('Legacy cursor rejected')

        const page2 = await getPostIds(undefined, {
          ...options,
          after: page1.page_info.end_cursor ?? undefined,
        })

        expect(page2.results.map(result => result.id)).toEqual([currentPostId])
        expect(page2.results[0]?.id).not.toBe(page1.results[0]?.id)
      },
    )
  })
})
