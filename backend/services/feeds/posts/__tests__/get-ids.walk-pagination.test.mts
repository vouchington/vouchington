import { describe, expect, it } from 'vitest'
import {
  createTestPost,
  createTestUser,
  followUser,
  hidePost,
  insertPostFeedShareForTest,
  setPostVotesScoreUp,
} from '@voucha/test-helpers'
import { getPostFeedIds } from '../get-ids.mts'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import type { PostFeedOptions } from '../../types.mts'

const sorts = [
  { sort: 'new', time_range: '1w' },
  { sort: 'hot', time_range: '1w' },
  { sort: 'best', time_range: 'all' },
] as const

describe('post feed single walk', () => {
  it.each(sorts)(
    'pages $sort to the end through an ineligible run longer than a page',
    async ({ sort, time_range }) => {
      const viewer = await createTestUser()
      const author = await createTestUser()
      const sharer = await createTestUser()
      await followUser(viewer, author)
      await withDominantPostFixtures(
        Array.from({ length: 8 }, (_, index) => ({
          createdAt: new Date(`9999-12-31T23:59:59.${991 + index}Z`),
          votesScoreUp: index < 3 ? 100_000_000 + index : 100_001_000 + index,
          createdById: author.id,
        })),
        async ids => {
          const visible = ids.slice(0, 3)
          for (const id of ids.slice(3)) await hidePost(viewer, { id })
          const sharedId = await insertPostFeedShareForTest({
            recipientUserId: viewer.id,
            sharedByUserId: sharer.id,
            postId: visible[0]!,
            sortAt: new Date('9999-12-31T23:59:59.990Z'),
          })
          const options = {
            feed_type: 'follow_users',
            sort: sort === 'new' ? 'new' : 'hot',
            time_range,
            limit: 2,
          } satisfies PostFeedOptions
          const deliveries: { id: string; entity_id: string; delivery_type: string }[] = []
          let after: string | undefined
          let reader = viewer
          for (let pages = 0; pages < 10; pages += 1) {
            const page = await getPostFeedIds(reader, { ...options, after })
            expect(page.results.length).toBeLessThanOrEqual(2)
            deliveries.push(...page.results)
            if (deliveries.length === 4 || !page.page_info.has_next_page) break
            const next = page.page_info.end_cursor ?? undefined
            if (!next || next === after) throw new Error('Expected advancing continuation cursor')
            after = next
            reader = { ...viewer, roles: ['administrator'] }
          }
          expect(deliveries.map(row => row.entity_id).toSorted()).toEqual(
            [...visible, visible[0]!].toSorted(),
          )
          expect(new Set(deliveries.map(row => row.id)).size).toBe(deliveries.length)
          expect(deliveries.find(row => row.id === sharedId)?.delivery_type).toBe('share')
        },
      )
    },
  )

  it('rejects a cursor that belongs to another sort', async () => {
    const viewer = await createTestUser()
    const author = await createTestUser()
    await followUser(viewer, author)
    for (let index = 0; index < 2; index += 1) {
      const post = await createTestPost({ user: author })
      await setPostVotesScoreUp(post.id, 1)
    }
    const page = await getPostFeedIds(viewer, { feed_type: 'follow_users', sort: 'new', limit: 1 })
    await expect(
      getPostFeedIds(viewer, {
        feed_type: 'follow_users',
        sort: 'hot',
        limit: 1,
        after: page.page_info.end_cursor!,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Invalid cursor format for post feed' })
  })
})
