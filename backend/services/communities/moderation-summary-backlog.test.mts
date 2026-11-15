import { getMinUUIDv7ForDate } from '@modules/utils'
import { collectModerationSummaryPage } from './moderation-summary-collection.mts'
import { collectModerationSummaryMemberPage } from './moderation-summary-activity-pages.mts'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestCommunityApplication } from '@voucha/test-helpers/entities/community-applications'
import { insertTestModerationReport } from '@voucha/test-helpers/entities/moderation-reports'
import {
  createModerationSummaryScan,
  createModerationSummaryCollection,
} from '@queues/background/enqueues/moderation-summary-state'
import {
  collectRankReviewPage,
  collectRankApplicationPage,
} from './moderation-summary-rank-direct.mts'
import {
  collectRankReportPostPage,
  collectRankReportPage,
} from './moderation-summary-rank-reports.mts'

describe('moderation digest backlog boundaries', () => {
  it('includes persisted future-key backlog and freezes the maximum across source pages', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const future = new Date(Date.now() + 120000)
    const post = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Persisted future-key backlog',
      markdown: 'Pending now',
      slug: `digest-backlog-${crypto.randomUUID()}`,
      createdAt: future,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: post,
      submittedById: user.id,
    })
    const reviews = createModerationSummaryScan(community.id, 'reviews')
    await collectRankReviewPage(reviews, 1)
    expect(reviews).toMatchObject({ sourceUpperId: post, metrics: { pending_post_reviews: 1 } })
    const later = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Arrived after source snapshot',
      markdown: 'Later backlog',
      slug: `digest-later-${crypto.randomUUID()}`,
      createdAt: new Date(future.getTime() + 1000),
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: later,
      submittedById: user.id,
    })
    await collectRankReviewPage(reviews, 1)
    expect(reviews).toMatchObject({ stage: 'applications', metrics: { pending_post_reviews: 1 } })

    await insertTestCommunityApplication({ communityId: community.id, userId: user.id })
    const applications = createModerationSummaryScan(community.id, 'applications')
    await collectRankApplicationPage(applications, 25)
    expect(applications.metrics.pending_applications).toBe(1)

    const report = await insertTestModerationReport({
      reporterUserId: user.id,
      entityType: 'post',
      entityId: post,
      communityId: community.id,
      createdAt: future,
    })
    const reports = createModerationSummaryScan(community.id, 'report-posts')
    await collectRankReportPostPage(reports, 25)
    expect(reports).toMatchObject({ stage: 'reports', parentId: post, sourceUpperId: later })
    await collectRankReportPage(reports, 1)
    expect(reports).toMatchObject({
      childUpperId: report,
      sourceUpperId: later,
      metrics: { pending_reports: 1 },
    })
  })
  it('uses distinct persisted user and community membership maxima beyond the activity clock', async () => {
    const recipient = await createTestUser()
    const other = await createTestUser()
    const community = await insertTestCommunity({ createdById: recipient.id })
    const end = new Date()
    const start = new Date(end.getTime() - 86400000)
    const moderator = await insertTestCommunityMember({
      communityId: community.id,
      userId: recipient.id,
      role: 'moderator',
      createdAt: new Date(end.getTime() + 120000),
    })
    const member = await insertTestCommunityMember({
      communityId: community.id,
      userId: other.id,
      role: 'member',
      createdAt: new Date(end.getTime() + 180000),
    })
    const first = await collectModerationSummaryPage(
      recipient.id,
      start,
      end,
      end,
      createModerationSummaryCollection(),
      [],
      { membershipPageSize: 1, sourcePageSize: 1 },
    )
    expect(first.collection).toMatchObject({
      upperMembershipId: moderator.id,
      phase: 'community',
      scan: { communityId: community.id },
    })
    const scan = createModerationSummaryScan(community.id, 'members')
    const lower = getMinUUIDv7ForDate(start),
      upper = getMinUUIDv7ForDate(end)
    await collectModerationSummaryMemberPage(scan, lower, upper, start, end, 1)
    expect(scan).toMatchObject({
      sourceUpperId: member.id,
      metrics: { total_active_members: 1, new_members: 0 },
    })
    await collectModerationSummaryMemberPage(scan, lower, upper, start, end, 1)
    expect(scan.metrics).toMatchObject({ total_active_members: 2, new_members: 0 })
  })
})
