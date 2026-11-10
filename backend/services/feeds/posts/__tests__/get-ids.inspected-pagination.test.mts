import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  followUser,
  hidePost,
  insertPostFeedShareForTest,
} from '@voucha/test-helpers'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { postsWorkConfig, getPostsWorkLimit } from '@services/posts/work-limits'
import { getPostFeedIds } from '../get-ids.mts'
import { decodeCursor } from '@modules/pagination'

describe('bounded post feed pages', () => {
  it('continues a filtered page at a valid five-digit UUIDv7 timestamp', async () => {
    await postsWorkConfig.waitForInitialization()
    const viewer = await createTestUser()
    const author = await createTestUser()
    await followUser(viewer, author)
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_feed_candidate_limit: 1,
    })
    try {
      await withDominantPostFixtures(
        [2, 1, 0].map(offset => ({
          createdAt: new Date(281_474_976_710_655 - offset),
          createdById: author.id,
        })),
        async ([oldest, middle, newest]) => {
          await hidePost(viewer, { id: middle! })
          await hidePost(viewer, { id: newest! })
          const options = {
            feed_type: 'follow_users' as const,
            limit: 5,
            post_types: ['discussion' as const],
          }
          const first = await getPostFeedIds(viewer, options)
          expect(first.results.map(row => row.entity_id)).toEqual([oldest])
          expect(first.page_info.has_next_page).toBe(true)
          const cursor = first.page_info.end_cursor
          expect(cursor).toEqual(expect.any(String))
          const decoded = decodeCursor(cursor!) as { timestamp: string; id: string }
          expect(decoded.timestamp).toMatch(/^\d{5}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/)
          expect(decoded.id).toBe(first.results[0]?.id)
          const next = await getPostFeedIds(viewer, { ...options, after: cursor! })
          expect(next.results).toEqual([])
          expect(next.page_info.has_next_page).toBe(false)
        },
      )
    } finally {
      restore()
    }
  })

  it.each([
    { label: 'new', sort: 'new', time_range: '1w' },
    { label: 'hot', sort: 'hot', time_range: '1w' },
    { label: 'best', sort: 'hot', time_range: 'all' },
  ] as const)(
    'keeps direct and shared $label deliveries after hidden posts are filtered',
    async ({ sort, time_range }) => {
      await postsWorkConfig.waitForInitialization()
      const viewer = await createTestUser()
      const author = await createTestUser()
      const sharer = await createTestUser()
      await followUser(viewer, author)
      const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
        post_feed_candidate_limit: 2,
      })
      try {
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
      } finally {
        restore()
      }
    },
  )

  it('uses the candidate default for invalid configuration and accepts the hard maximum', async () => {
    await postsWorkConfig.waitForInitialization()
    expect(getPostsWorkLimit('post_feed_candidate_limit')).toBe(1000)
    const invalid = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      post_feed_candidate_limit: 1_000_000,
    })
    try {
      expect(getPostsWorkLimit('post_feed_candidate_limit')).toBe(1000)
      const maximum = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
        post_feed_candidate_limit: 10_000,
      })
      try {
        expect(getPostsWorkLimit('post_feed_candidate_limit')).toBe(10_000)
      } finally {
        maximum()
      }
    } finally {
      invalid()
    }
  })
})
