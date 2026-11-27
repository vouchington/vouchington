import { getMinUuidv7ForDate } from '@modules/utils'
import {
  completeModerationSummaryRank,
  runModerationSummaryMemberships,
} from './moderation-summary-collection.mts'
import { collectModerationSummaryMemberPage } from './moderation-summary-activity-pages.mts'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { setTestBanEvasionFlag } from '@voucha/test-helpers/entities/community-bans'
import { moderationSummaryWorkConfig } from './moderation-summary-work.mts'
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
  collectRankEvaders,
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
    const reviews = await collectRankReviewPage(createModerationSummaryScan(community.id), 1)
    expect(reviews.state).toMatchObject({
      sourceUpperId: post,
      metrics: { pending_post_reviews: 1 },
    })
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
    expect(await collectRankReviewPage(reviews.state, 1)).toMatchObject({
      state: { metrics: { pending_post_reviews: 1 } },
      next: 'applications',
    })

    await insertTestCommunityApplication({ communityId: community.id, userId: user.id })
    const applications = await collectRankApplicationPage(
      createModerationSummaryScan(community.id),
      25,
    )
    expect(applications.state.metrics.pending_applications).toBe(1)

    const report = await insertTestModerationReport({
      reporterUserId: user.id,
      entityType: 'post',
      entityId: post,
      communityId: community.id,
      createdAt: future,
    })
    const parents = await collectRankReportPostPage(createModerationSummaryScan(community.id), 25)
    expect(parents).toMatchObject({
      state: { parentId: post, sourceUpperId: later },
      next: 'reports',
    })
    const reports = await collectRankReportPage(parents.state, 1)
    expect(reports.state).toMatchObject({
      childUpperId: report,
      sourceUpperId: later,
      metrics: { pending_reports: 1 },
    })
  })
  it('caps the ranking contribution while preserving the suspected evader count', async () => {
    const [owner, first, second] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all(
      [first, second].map(async member => {
        const identity = { communityId: community.id, userId: member.id }
        await insertTestCommunityMember({ ...identity, role: 'member' })
        await setTestBanEvasionFlag({ ...identity, sourceUserId: owner.id })
      }),
    )

    const restore = overrideDynamicConfigFieldsForTest(moderationSummaryWorkConfig, {
      suspected_ban_evaders_rank_cap: 1,
    })
    try {
      const scan = await collectRankEvaders(createModerationSummaryScan(community.id))
      const result = completeModerationSummaryRank({ ...createModerationSummaryCollection(), scan })
      expect(result.top).toMatchObject([
        { communityId: community.id, pendingScore: 1, metrics: { suspected_ban_evaders: 2 } },
      ])
    } finally {
      restore()
    }
  })

  it('counts raw memberships and resumes within the frozen recipient range', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(moderationSummaryWorkConfig, {
        memberships_max_batches_per_run: 1,
      }),
    )
    const [recipient, other] = await Promise.all([createTestUser(), createTestUser()])
    const [plain, moderated, added] = await Promise.all(
      Array.from({ length: 3 }, () => insertTestCommunity({ createdById: other.id })),
    )
    const windowEnd = new Date()
    const at = (offset: number) => new Date(windowEnd.getTime() + offset)
    const member = await insertTestCommunityMember({
      communityId: plain.id,
      userId: recipient.id,
      role: 'member',
      createdAt: at(60_000),
    })
    await insertTestCommunityMember({
      communityId: plain.id,
      userId: other.id,
      role: 'moderator',
      createdAt: at(120_000),
    })
    const moderator = await insertTestCommunityMember({
      communityId: moderated.id,
      userId: recipient.id,
      role: 'moderator',
      createdAt: at(180_000),
    })
    const args = {
      userId: recipient.id,
      windowStart: at(-86_400_000),
      windowEnd,
      eligibilityAt: windowEnd,
      collection: createModerationSummaryCollection(),
      communities: [],
      limits: { membershipPageSize: 1, sourcePageSize: 1 },
    }
    const first = await runModerationSummaryMemberships(args)
    expect(first).toMatchObject({
      next: 'memberships',
      collection: { afterMembershipId: member.id, upperMembershipId: moderator.id, scan: null },
    })
    await insertTestCommunityMember({
      communityId: added.id,
      userId: recipient.id,
      role: 'moderator',
      createdAt: at(240_000),
    })
    const second = await runModerationSummaryMemberships({ ...args, collection: first.collection })
    expect(second).toMatchObject({
      next: 'reviews',
      collection: {
        afterMembershipId: moderator.id,
        upperMembershipId: moderator.id,
        scan: { communityId: moderated.id },
      },
    })
    const exhausted = await runModerationSummaryMemberships({
      ...args,
      collection: { ...second.collection, scan: null },
    })
    expect(exhausted).toMatchObject({
      next: 'send',
      collection: { afterMembershipId: moderator.id, upperMembershipId: moderator.id, scan: null },
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
    const first = await runModerationSummaryMemberships({
      userId: recipient.id,
      windowStart: start,
      windowEnd: end,
      eligibilityAt: end,
      collection: createModerationSummaryCollection(),
      communities: [],
      limits: { membershipPageSize: 1, sourcePageSize: 1 },
    })
    expect(first).toMatchObject({
      next: 'reviews',
      collection: { upperMembershipId: moderator.id, scan: { communityId: community.id } },
    })
    const lower = getMinUuidv7ForDate(start),
      upper = getMinUuidv7ForDate(end)
    const page = await collectModerationSummaryMemberPage(
      createModerationSummaryScan(community.id),
      lower,
      upper,
      start,
      end,
      1,
    )
    expect(page.state).toMatchObject({
      sourceUpperId: member.id,
      metrics: { total_active_members: 1, new_members: 0 },
    })
    const next = await collectModerationSummaryMemberPage(page.state, lower, upper, start, end, 1)
    expect(next.state.metrics).toMatchObject({ total_active_members: 2, new_members: 0 })
  })
})
