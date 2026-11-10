import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  followUser,
  hidePost,
  insertPostFeedShareForTest,
} from '@voucha/test-helpers'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { postsWorkConfig } from '@services/posts/work-limits'
import { getPostFeedIds } from '../get-ids.mts'

describe('bounded post feed pages', () => {
  it('returns the older visible post when newer deliveries are hidden', async () => {
    await postsWorkConfig.waitForInitialization()
    const viewer = await createTestUser()
    const author = await createTestUser()
    await followUser(viewer, author)
    await withDominantPostFixtures(
      [2, 1, 0].map(offset => ({
        createdAt: new Date(281_474_976_710_655 - offset),
        createdById: author.id,
      })),
      async ([oldest, middle, newest]) => {
        await hidePost(viewer, { id: middle! })
        await hidePost(viewer, { id: newest! })
        const page = await getPostFeedIds(viewer, {
          feed_type: 'follow_users',
          limit: 5,
          post_types: ['discussion'],
        })
        expect(page.results.map(row => row.id)).toEqual([oldest])
        expect(page.page_info.has_next_page).toBe(false)
        expect(page.page_info.end_cursor).toBeNull()
      },
    )
  })

  it.each([
    { label: 'new', sort: 'new', time_range: '1w' },
    { label: 'hot', sort: 'hot', time_range: '1w' },
    { label: 'best', sort: 'hot', time_range: 'all' },
  ] as const)(
    'advances through hidden $label candidates without losing direct or shared deliveries',
    async ({ sort, time_range }) => {
      await postsWorkConfig.waitForInitialization()
      const viewer = await createTestUser()
      const author = await createTestUser()
      const sharer = await createTestUser()
      await followUser(viewer, author)
      await withDominantPostFixtures(
        [994, 995, 996, 997, 998, 999].map((milliseconds, index) => ({
          createdAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
          votesScoreUp: index >= 3 ? 100_000_001 : 100_000_000,
          createdById: author.id,
        })),
        async ids => {
          for (const id of ids.slice(3)) await hidePost(viewer, { id })
          const shared = await insertPostFeedShareForTest({
            recipientUserId: viewer.id,
            sharedByUserId: sharer.id,
            postId: ids[0]!,
            sortAt: new Date('9999-12-31T23:59:59.993Z'),
          })
          const expected = [...ids.slice(0, 3), shared].toSorted()
          const seen: string[] = []
          let after: string | undefined
          for (let pageIndex = 0; pageIndex < 30; pageIndex++) {
            const page = await getPostFeedIds(viewer, {
              feed_type: 'follow_users',
              sort,
              time_range,
              limit: 2,
              after,
            })
            seen.push(...page.results.map(row => row.id))
            if (expected.every(id => seen.includes(id)) || !page.page_info.has_next_page) break
            after = page.page_info.end_cursor ?? undefined
            if (!after) throw new Error('Expected continuation cursor')
          }
          expect(seen.toSorted()).toEqual(expected)
          expect(new Set(seen).size).toBe(seen.length)
        },
      )
    },
  )
})
