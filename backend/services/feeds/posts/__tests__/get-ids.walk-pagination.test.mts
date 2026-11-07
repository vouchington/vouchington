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
      const visible = []
      for (const votes of [1, 2, 3]) {
        const post = await createTestPost({ user: author })
        await setPostVotesScoreUp(post.id, votes)
        visible.push(post)
      }
      // Five ineligible posts outrank every visible one in all three orders.
      for (let index = 0; index < 5; index += 1) {
        const post = await createTestPost({ user: author })
        await setPostVotesScoreUp(post.id, 500 + index)
        await hidePost(viewer, post)
      }
      const sharedId = await insertPostFeedShareForTest({
        recipientUserId: viewer.id,
        sharedByUserId: sharer.id,
        postId: visible[0]!.id,
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
        // A page is empty only when nothing is left: full pages continue, the last is non-empty.
        expect(page.results).toHaveLength(page.page_info.has_next_page ? 2 : page.results.length)
        expect(page.results.length).toBeGreaterThan(0)
        deliveries.push(...page.results)
        if (!page.page_info.has_next_page) break
        after = page.page_info.end_cursor!
        // A role change between pages keeps the keyset valid for the new viewer scope.
        reader = { ...viewer, roles: ['administrator'] }
      }

      expect(deliveries.map(row => row.entity_id).toSorted()).toEqual(
        [...visible.map(post => post.id), visible[0]!.id].toSorted(),
      )
      expect(new Set(deliveries.map(row => row.id)).size).toBe(deliveries.length)
      expect(deliveries.find(row => row.id === sharedId)?.delivery_type).toBe('share')
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
