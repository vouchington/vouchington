import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  insertPostFeedShareForTest,
  insertScoredPostTopicCategoryRelation,
  setPostDeletedForTest,
} from '@voucha/test-helpers'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { postsWorkConfig } from '@services/posts/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getPostFeedIds } from '../get-ids.mts'

describe('topic share raw input continuation', () => {
  it('advances through raw shares of a deleted post before delivering an older share', async () => {
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
        [996, 997].map(milliseconds => ({
          createdAt: new Date(`9998-12-31T23:59:59.${milliseconds}Z`),
          createdById: author.id,
        })),
        async ([valid, deleted]) => {
          for (const postId of [valid!, deleted!])
            await insertScoredPostTopicCategoryRelation(
              postId,
              topic.id,
              author.id,
              new Date('9998-12-31T23:59:59.998Z'),
            )
          await setPostDeletedForTest(deleted!)
          for (const milliseconds of [999, 998, 997])
            await insertPostFeedShareForTest({
              recipientUserId: viewer.id,
              sharedByUserId: sharer.id,
              postId: deleted!,
              sortAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
            })
          const visibleShare = await insertPostFeedShareForTest({
            recipientUserId: viewer.id,
            sharedByUserId: sharer.id,
            postId: valid!,
            sortAt: new Date('9999-12-31T23:59:59.996Z'),
          })
          const options = {
            feed_type: 'follow_users' as const,
            hashtag_topic_ids: [topic.id],
            sort: 'new' as const,
            time_range: 'all' as const,
            limit: 5,
          }
          const first = await getPostFeedIds(viewer, options)
          expect(first.results).toEqual([])
          expect(first.page_info.has_next_page).toBe(true)
          let after = first.page_info.end_cursor!
          let found = false
          for (let pageIndex = 0; pageIndex < 24; pageIndex += 1) {
            const page = await getPostFeedIds(viewer, { ...options, after })
            const ids = page.results.map(result => result.id)
            expect(ids.every(id => id === visibleShare)).toBe(true)
            if (ids.includes(visibleShare)) {
              found = true
              break
            }
            expect(page.page_info.has_next_page).toBe(true)
            expect(page.page_info.end_cursor).toBeTruthy()
            expect(page.page_info.end_cursor).not.toBe(after)
            after = page.page_info.end_cursor!
          }
          expect(found).toBe(true)
        },
      )
    } finally {
      restore()
    }
  })
})
