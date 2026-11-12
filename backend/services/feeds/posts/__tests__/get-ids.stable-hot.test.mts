import { describe, expect, it } from 'vitest'
import { createTestUser, followUser, insertPostFeedShareForTest } from '@voucha/test-helpers'
import { withDominantPostFixtures } from '@voucha/test-helpers/entities/trending-posts'
import { getPostFeedIds } from '../get-ids.mts'

describe('stable hot feed ranking', () => {
  it('ranks future posts by search rank and pages equal-rank post deliveries together', async () => {
    const viewer = await createTestUser()
    const author = await createTestUser()
    const sharer = await createTestUser()
    await followUser(viewer, author)
    await withDominantPostFixtures(
      [
        {
          createdAt: new Date('2026-11-09T00:00:00Z'),
          createdById: author.id,
          votesScoreUp: 100_000_001,
        },
        ...Array.from({ length: 2 }, () => ({
          createdAt: new Date('9999-12-31T23:59:59.900Z'),
          createdById: author.id,
          votesScoreUp: 1,
        })),
      ],
      async ([past, ...future]) => {
        const expected: string[] = []
        for (const postId of future.toSorted().toReversed()) {
          const share = await insertPostFeedShareForTest({
            recipientUserId: viewer.id,
            sharedByUserId: sharer.id,
            postId,
            sortAt: new Date('2026-11-09T00:00:00Z'),
          })
          expected.push(postId, share)
        }
        // The future timestamp contributes to stable rank; its score is no longer age-clamped.
        // Stop after the future group, before any unrelated old rows can enter the inspected walk.
        const seen: string[] = []
        let after: string | undefined
        for (const expectedDeliveryId of expected) {
          const page = await getPostFeedIds(
            viewer,
            {
              feed_type: 'follow_users',
              sort: 'hot',
              time_range: '1w',
              limit: 1,
              after,
            },
            new Date('2026-11-10T00:00:00Z'),
          )
          expect(page.results.map(row => row.id)).toEqual([expectedDeliveryId])
          seen.push(...page.results.map(row => row.id))
          expect(page.results.some(row => row.entity_id === past)).toBe(false)
          expect(page.page_info.has_next_page).toBe(true)
          const next = page.page_info.end_cursor
          if (!next || next === after) throw new Error('Expected advancing ranked delivery cursor')
          after = next
        }
        expect(seen).toEqual(expected)
      },
    )
  })
})
