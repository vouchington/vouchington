import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { markTestPostDeletedBy } from '@voucha/test-helpers/entities/posts-deletion'
import { softDeleteUserAt } from '@voucha/test-helpers/entities/users-lifecycle'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import {
  insertTestModerationReport,
  insertTestReportJudgement,
} from '@voucha/test-helpers/entities/moderation-reports'
import { moveTestModerationSummaryPost } from '@voucha/test-helpers/moderation-summary-count-fixture'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { createModerationSummaryScan } from '@queues/background/enqueues/moderation-summary-state'
import { collectRankReviewPage } from './moderation-summary-rank-direct.mts'
import {
  collectRankReportPage,
  collectRankReportPostPage,
} from './moderation-summary-rank-reports.mts'
import {
  collectModerationSummaryMemberPage,
  collectModerationSummaryReplyPage,
} from './moderation-summary-activity-pages.mts'

describe('moderator digest raw source pages', () => {
  it('advances over deleted review and reply rows before counting a later live row', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const first = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Deleted first',
      markdown: 'First',
      slug: `digest-raw-${crypto.randomUUID()}`,
      createdAt: new Date(Date.now() - 3000),
    })
    const second = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Live second',
      markdown: 'Second',
      slug: `digest-raw-${crypto.randomUUID()}`,
      createdAt: new Date(Date.now() - 2000),
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: first,
      submittedById: user.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: second,
      submittedById: user.id,
    })
    await markTestPostDeletedBy(first, user.id)
    const firstPage = await collectRankReviewPage(createModerationSummaryScan(community.id), 1)
    expect(firstPage).toMatchObject({
      state: { afterId: first, metrics: { pending_post_reviews: 0 } },
      next: null,
    })
    const secondPage = await collectRankReviewPage(firstPage.state, 1)
    expect(secondPage.state).toMatchObject({
      afterId: second,
      metrics: { pending_post_reviews: 1 },
    })
    const deletedReply = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Deleted reply',
      markdown: 'Reply',
      slug: `digest-raw-${crypto.randomUUID()}`,
      postType: 'comment',
      parentId: second,
      rootId: second,
      createdAt: new Date(Date.now() - 1000),
    })
    const liveReply = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Live reply',
      markdown: 'Reply',
      slug: `digest-raw-${crypto.randomUUID()}`,
      postType: 'comment',
      parentId: second,
      rootId: second,
    })
    await markTestPostDeletedBy(deletedReply, user.id)
    const replyUpper = getMinUUIDv7ForDate(new Date(Date.now() + 1000))
    const replies = { ...createModerationSummaryScan(community.id), parentId: second }
    const deletedPage = await collectModerationSummaryReplyPage(replies, replyUpper, 1)
    expect(deletedPage).toMatchObject({
      state: { afterChildId: deletedReply, childCount: 0 },
      next: null,
    })
    const livePage = await collectModerationSummaryReplyPage(deletedPage.state, replyUpper, 1)
    expect(livePage.state).toMatchObject({ afterChildId: liveReply, childCount: 1 })
  })

  it('retains engagement from a deleted user while excluding that user from joined and total members', async () => {
    const owner = await createTestUser()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member.id,
      role: 'member',
    })
    await insertTestPost({
      createdById: member.id,
      communityId: community.id,
      title: 'Engagement',
      markdown: 'Activity',
      slug: `digest-member-${crypto.randomUUID()}`,
    })
    await softDeleteUserAt(member.id, new Date())
    const end = new Date(Date.now() + 1000),
      start = new Date(end.getTime() - 86400000)
    const upper = getMinUUIDv7ForDate(end)
    const page = await collectModerationSummaryMemberPage(
      createModerationSummaryScan(community.id),
      getMinUUIDv7ForDate(start),
      upper,
      start,
      end,
      25,
    )
    expect(page.state.metrics).toMatchObject({
      new_members: 0,
      total_active_members: 0,
      active_member_count: 1,
    })
  })

  it('counts reports on deleted posts but rechecks a retained post after it moves communities', async () => {
    const user = await createTestUser()
    const original = await insertTestCommunity({ createdById: user.id })
    const moved = await insertTestCommunity({ createdById: user.id })
    const postId = await insertTestPost({
      createdById: user.id,
      communityId: original.id,
      title: 'Reported',
      markdown: 'Report',
      slug: `digest-report-${crypto.randomUUID()}`,
    })
    await insertTestModerationReport({
      reporterUserId: user.id,
      entityType: 'post',
      entityId: postId,
      communityId: original.id,
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      recommendedAction: 'escalate',
    })
    await markTestPostDeletedBy(postId, user.id)
    const parents = await collectRankReportPostPage(createModerationSummaryScan(original.id), 1)
    expect(parents).toMatchObject({ state: { parentId: postId }, next: 'reports' })
    const counted = await collectRankReportPage(parents.state, 1)
    expect(counted.state.metrics).toMatchObject({ pending_reports: 1, escalated_items: 1 })
    const retained = { ...createModerationSummaryScan(original.id), parentId: postId }
    await moveTestModerationSummaryPost(postId, moved.id)
    expect(await collectRankReportPage(retained, 1)).toMatchObject({
      state: { parentId: null, metrics: { pending_reports: 0, escalated_items: 0 } },
      next: 'reportPosts',
    })
    const newParents = await collectRankReportPostPage(createModerationSummaryScan(moved.id), 1)
    const newCounted = await collectRankReportPage(newParents.state, 1)
    expect(newCounted.state.metrics).toMatchObject({ pending_reports: 1, escalated_items: 1 })
  })
})
