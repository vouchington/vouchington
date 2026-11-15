import { emptyModerationSummaryMetrics } from '@queues/background/enqueues/moderation-summary-state'
import {
  collectTestModerationSummaryState,
  collectTestModerationSummary,
} from '@voucha/test-helpers/moderation-summary-collection'
import {
  insertTestModerationSummaryCommunityCohort,
  insertTestModerationSummaryReviewCohort,
} from '@voucha/test-helpers/moderation-summary-count-fixture'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { rankModerationSummaryCommunities } from './moderation-summary-collection.mts'

describe('bounded moderator digest collection', () => {
  it('retains the highest twenty capped pending scores with deterministic identity ties', () => {
    let top: ReturnType<typeof rankModerationSummaryCommunities> = []
    for (let n = 0; n < 25; n++)
      top = rankModerationSummaryCommunities(top, {
        communityId: String(n).padStart(2, '0'),
        pendingScore: n % 3,
        discussionPostId: null,
        metrics: emptyModerationSummaryMetrics(),
      })
    expect(top).toHaveLength(20)
    expect(top.map(row => row.pendingScore)).toEqual(
      [...top.map(row => row.pendingScore)].toSorted((a, b) => b - a),
    )
    expect(top.filter(row => row.pendingScore === 2).map(row => row.communityId)).toEqual([
      '02',
      '05',
      '08',
      '11',
      '14',
      '17',
      '20',
      '23',
    ])
    const updated = rankModerationSummaryCommunities(top, {
      communityId: '02',
      pendingScore: 0,
      discussionPostId: null,
      metrics: emptyModerationSummaryMetrics(),
    })
    expect(updated.filter(row => row.communityId === '02')).toHaveLength(1)
  })

  it('continues past regular memberships and preserves the busiest discussion across post pages', async () => {
    const user = await createTestUser()
    const unrelated = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: unrelated.id, userId: user.id, role: 'member' })
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const first = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'First discussion',
      markdown: 'First',
      slug: `digest-first-${crypto.randomUUID()}`,
    })
    const best = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Busy discussion',
      markdown: 'Busy',
      slug: `digest-best-${crypto.randomUUID()}`,
    })
    await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      parentId: best,
      rootId: best,
      postType: 'comment',
      title: 'Reply',
      markdown: 'Reply',
      slug: `digest-reply-${crypto.randomUUID()}`,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: first,
      submittedById: user.id,
    })
    const end = new Date()
    const cards = await collectTestModerationSummary(
      user.id,
      new Date(end.getTime() - 86400000),
      end,
      end,
      { membershipPageSize: 1, sourcePageSize: 1 },
    )
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      communityId: community.id,
      pendingPostReviews: 1,
      topDiscussionTitle: 'Busy discussion',
      topDiscussionReplyCount: 1,
    })
  })
  it('caps independently counted work and activity at the 99+ boundary', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const excluded = await insertTestCommunity({ createdById: user.id })
    await insertTestModerationSummaryReviewCohort(community.id, user.id)
    const end = new Date()
    const start = new Date(end.getTime() - 86400000)
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    await insertTestCommunityMember({ communityId: excluded.id, userId: user.id, role: 'owner' })
    const cards = await collectTestModerationSummary(user.id, start, end, end)
    expect(cards).toEqual([
      expect.objectContaining({
        communityId: community.id,
        pendingPostReviews: 100,
        newDiscussionPosts: 100,
      }),
    ])
  })

  it('counts every eligible community while retaining only the highest twenty across pages', async () => {
    const user = await createTestUser()
    const ids = await insertTestModerationSummaryCommunityCohort(user.id)
    const end = new Date()
    const result = await collectTestModerationSummaryState(
      user.id,
      new Date(end.getTime() - 86400000),
      end,
      end,
    )
    expect(result.collection.eligibleCount).toBe(21)
    expect(result.communities.map(card => card.communityId)).toEqual(ids.slice(0, 20))
    expect(result.collection.eligibleCount - result.communities.length).toBe(1)
  })
})
