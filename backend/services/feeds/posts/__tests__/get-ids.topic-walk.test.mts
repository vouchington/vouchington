import { describe, expect, it } from 'vitest'
import {
  blockUser,
  createTestTopic,
  createTestUser,
  followUser,
  insertPostFeedShareForTest,
  insertScoredPostTopicCategoryRelation,
  setPostDeletedForTest,
} from '@voucha/test-helpers'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { postsWorkConfig } from '@services/posts/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { encodeCursor } from '@modules/pagination'
import { getPostFeedIds } from '../get-ids.mts'

describe('topic feed inspected-row continuation', () => {
  it.each([
    { sort: 'new', time_range: 'all' },
    { sort: 'hot', time_range: '1w' },
    { sort: 'hot', time_range: 'all' },
  ] as const)(
    'continues an empty $sort/$time_range page without losing direct or shared deliveries',
    async ({ sort, time_range }) => {
      await postsWorkConfig.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
        feed_inspected_row_cap: 2,
      })
      try {
        // NEW starts inside an owned valid timestamp window, below unrelated terminal UUID fixtures.
        const fixturePrefix = sort === 'new' ? '9998-12-31T23:59:59.' : '9999-12-31T23:59:59.'
        const viewer = await createTestUser()
        const author = await createTestUser()
        const sharer = await createTestUser()
        const topic = await createTestTopic({ user: viewer })
        await followUser(viewer, author)
        await withDominantPostFixtures(
          [996, 997, 998, 999].map(milliseconds => ({
            createdAt: new Date(`${fixturePrefix}${milliseconds}Z`),
            createdById: author.id,
            votesScoreUp: 100_000_001,
          })),
          async ([oldest, matching, , newest]) => {
            await insertScoredPostTopicCategoryRelation(
              oldest!,
              topic.id,
              author.id,
              new Date(`${fixturePrefix}998Z`),
            )
            await insertScoredPostTopicCategoryRelation(
              matching!,
              topic.id,
              author.id,
              new Date(`${fixturePrefix}998Z`),
            )
            const share = await insertPostFeedShareForTest({
              recipientUserId: viewer.id,
              sharedByUserId: sharer.id,
              postId: oldest!,
              sortAt: new Date(`${fixturePrefix}995Z`),
            })
            const options = {
              feed_type: 'follow_users' as const,
              hashtag_topic_ids: [topic.id],
              sort,
              time_range,
              limit: 5,
              after:
                sort === 'new'
                  ? encodeCursor({ timestamp: `${fixturePrefix}999999Z`, id: newest! })
                  : undefined,
            }
            const first = await getPostFeedIds(viewer, options, new Date('2026-11-10T00:00:00Z'))
            expect(first.results).toEqual([])
            expect(first.page_info.has_next_page).toBe(true)
            expect(first.page_info.end_cursor).toBeTruthy()
            const seen: string[] = []
            let after = first.page_info.end_cursor!
            for (let pages = 0; pages < 4; pages += 1) {
              const page = await getPostFeedIds(
                viewer,
                { ...options, after },
                new Date('2026-11-10T00:00:00Z'),
              )
              seen.push(...page.results.map(row => row.id))
              if (!page.page_info.has_next_page) break
              expect(page.page_info.end_cursor).not.toBe(after)
              after = page.page_info.end_cursor!
            }
            expect(seen).toEqual([matching!, oldest!, share])
          },
        )
      } finally {
        restore()
      }
    },
  )

  it('continues a best page through same-post shares and a rejected sharer', async () => {
    await postsWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      feed_inspected_row_cap: 2,
    })
    try {
      const viewer = await createTestUser()
      const author = await createTestUser()
      const sharer = await createTestUser()
      const blockedSharer = await createTestUser()
      const topic = await createTestTopic({ user: viewer })
      await followUser(viewer, author)
      await blockUser(viewer, blockedSharer)
      await withDominantPostFixtures(
        [
          {
            createdAt: new Date('9999-12-31T23:59:59.996Z'),
            createdById: author.id,
            votesScoreUp: 1_000_000_000,
          },
        ],
        async ([postId]) => {
          await insertScoredPostTopicCategoryRelation(
            postId!,
            topic.id,
            author.id,
            new Date('9999-12-31T23:59:59.998Z'),
          )
          const validShares: string[] = []
          for (let index = 0; index < 4; index += 1)
            validShares.push(
              await insertPostFeedShareForTest({
                recipientUserId: viewer.id,
                sharedByUserId: sharer.id,
                postId: postId!,
              }),
            )
          const rejectedShare = await insertPostFeedShareForTest({
            recipientUserId: viewer.id,
            sharedByUserId: blockedSharer.id,
            postId: postId!,
          })
          const options = {
            feed_type: 'follow_users' as const,
            hashtag_topic_ids: [topic.id],
            sort: 'hot' as const,
            time_range: 'all' as const,
            limit: 1,
          }
          const seen: string[] = []
          let after: string | undefined
          let collected = false
          for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
            const page = await getPostFeedIds(
              viewer,
              { ...options, after },
              new Date('2026-11-11T00:00:00Z'),
            )
            expect(page.results.length).toBeLessThanOrEqual(1)
            seen.push(...page.results.map(result => result.id))
            expect(page.results.some(result => result.id === rejectedShare)).toBe(false)
            if (seen.length === 5) {
              collected = true
              break
            }
            expect(page.page_info.has_next_page).toBe(true)
            expect(page.page_info.end_cursor).toBeTruthy()
            expect(page.page_info.end_cursor).not.toBe(after)
            after = page.page_info.end_cursor!
          }
          expect(collected).toBe(true)
          expect(seen).toEqual([postId!, ...validShares.toReversed()])
        },
      )
    } finally {
      restore()
    }
  })

  it.each([
    { sort: 'hot', time_range: '1w' },
    { sort: 'hot', time_range: 'all' },
  ] as const)(
    'continues $sort/$time_range when the cursor post disappears and the next share id is newer',
    async ({ sort, time_range }) => {
      await postsWorkConfig.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
        feed_inspected_row_cap: 2,
      })
      try {
        const viewer = await createTestUser()
        const author = await createTestUser()
        const sharer = await createTestUser()
        const topic = await createTestTopic({ user: viewer })
        await withDominantPostFixtures(
          [997, 998].map(milliseconds => ({
            createdAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
            createdById: author.id,
            votesScoreUp: 1_000_000_000,
          })),
          async ([older, cursorPost]) => {
            for (const postId of [older!, cursorPost!])
              await insertScoredPostTopicCategoryRelation(
                postId,
                topic.id,
                author.id,
                new Date('9999-12-31T23:59:59.999Z'),
              )
            const cursorShare = await insertPostFeedShareForTest({
              recipientUserId: viewer.id,
              sharedByUserId: sharer.id,
              postId: cursorPost!,
            })
            const nextShare = await insertPostFeedShareForTest({
              recipientUserId: viewer.id,
              sharedByUserId: sharer.id,
              postId: older!,
            })
            expect(nextShare.localeCompare(cursorShare)).toBeGreaterThan(0)
            const options = {
              feed_type: 'follow_users' as const,
              hashtag_topic_ids: [topic.id],
              sort,
              time_range,
              limit: 1,
            }
            const first = await getPostFeedIds(viewer, options, new Date('2026-11-11T00:00:00Z'))
            expect(first.results.map(row => row.id)).toEqual([cursorShare])
            expect(first.page_info.end_cursor).toBeTruthy()
            await setPostDeletedForTest(cursorPost!)
            const second = await getPostFeedIds(
              viewer,
              { ...options, after: first.page_info.end_cursor! },
              new Date('2026-11-11T00:00:00Z'),
            )
            expect(second.results.map(row => row.id)).toEqual([nextShare])
          },
        )
      } finally {
        restore()
      }
    },
  )
  it('keeps a recent ranked share when its target predates the direct cutoff', async () => {
    await postsWorkConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      feed_inspected_row_cap: 1,
    })
    try {
      const viewer = await createTestUser()
      const author = await createTestUser()
      const topic = await createTestTopic({ user: viewer })
      await withDominantPostFixtures(
        ['9999-12-01T00:00:00Z', '9999-12-02T00:00:00Z'].map(createdAt => ({
          createdAt: new Date(createdAt),
          createdById: author.id,
          votesScoreUp: 1_000_000_000,
        })),
        async ([target]) => {
          await insertScoredPostTopicCategoryRelation(
            target!,
            topic.id,
            author.id,
            new Date('9999-12-03T00:00:00Z'),
          )
          const shareId = await insertPostFeedShareForTest({
            recipientUserId: viewer.id,
            sharedByUserId: author.id,
            postId: target!,
            sortAt: new Date('9999-12-30T00:00:00Z'),
          })
          const seen: string[] = []
          let after: string | undefined
          for (let index = 0; index < 4; index += 1) {
            const page = await getPostFeedIds(
              viewer,
              {
                feed_type: 'follow_users',
                sort: 'hot',
                time_range: '1w',
                hashtag_topic_ids: [topic.id],
                limit: 1,
                after,
              },
              new Date('9999-12-31T00:00:00Z'),
            )
            seen.push(...page.results.map(row => row.id))
            if (seen.includes(shareId)) break
            expect(page.page_info.has_next_page).toBe(true)
            expect(page.page_info.end_cursor).toBeTruthy()
            expect(page.page_info.end_cursor).not.toBe(after)
            after = page.page_info.end_cursor!
          }
          expect(seen).toEqual([shareId])
        },
      )
    } finally {
      restore()
    }
  })
})
