import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  followUser,
  insertPostFeedShareForTest,
  insertScoredPostTopicCategoryRelation,
} from '@voucha/test-helpers'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { getPostFeedIds } from '../get-ids.mts'

describe('topic feed inspected-row continuation', () => {
  it.each([
    { sort: 'new', time_range: 'all' },
    { sort: 'hot', time_range: '1w' },
    { sort: 'hot', time_range: 'all' },
  ] as const)(
    'continues an empty $sort/$time_range page without losing direct or shared deliveries',
    async ({ sort, time_range }) => {
      const viewer = await createTestUser()
      const author = await createTestUser()
      const sharer = await createTestUser()
      const topic = await createTestTopic({ user: viewer })
      await followUser(viewer, author)
      await withDominantPostFixtures(
        [996, 997, 998, 999].map(milliseconds => ({
          createdAt: new Date(`9999-12-31T23:59:59.${milliseconds}Z`),
          createdById: author.id,
          votesScoreUp: 100_000_001,
        })),
        async ([oldest, matching]) => {
          await insertScoredPostTopicCategoryRelation(
            oldest!,
            topic.id,
            author.id,
            new Date('9999-12-31T23:59:59.998Z'),
          )
          await insertScoredPostTopicCategoryRelation(
            matching!,
            topic.id,
            author.id,
            new Date('9999-12-31T23:59:59.998Z'),
          )
          const share = await insertPostFeedShareForTest({
            recipientUserId: viewer.id,
            sharedByUserId: sharer.id,
            postId: oldest!,
            sortAt: new Date('9999-12-31T23:59:59.995Z'),
          })
          const options = {
            feed_type: 'follow_users' as const,
            hashtag_topic_ids: [topic.id],
            sort,
            time_range,
            limit: 5,
          }
          const first = await getPostFeedIds(viewer, options, new Date('2026-11-10T00:00:00Z'), 2)
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
              2,
            )
            seen.push(...page.results.map(row => row.id))
            if (!page.page_info.has_next_page) break
            expect(page.page_info.end_cursor).not.toBe(after)
            after = page.page_info.end_cursor!
          }
          expect(seen).toEqual([matching!, oldest!, share])
        },
      )
    },
  )
})
