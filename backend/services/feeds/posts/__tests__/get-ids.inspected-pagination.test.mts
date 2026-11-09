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

describe('bounded post feed pages', () => {
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
            let sawShort = false
            for (let pageIndex = 0; pageIndex < 30; pageIndex++) {
              const page = await getPostFeedIds(viewer, {
                feed_type: 'follow_users',
                sort,
                time_range,
                limit: 2,
                after,
              })
              sawShort ||= page.results.length < 2 && page.page_info.has_next_page
              seen.push(...page.results.map(row => row.id))
              if (expected.every(id => seen.includes(id)) || !page.page_info.has_next_page) break
              after = page.page_info.end_cursor ?? undefined
              if (!after) throw new Error('Expected continuation cursor')
            }
            expect(sawShort).toBe(true)
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
