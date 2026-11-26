import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import {
  createModerationSummaryCollection,
  createModerationSummaryScan,
  MODERATION_SUMMARY_ZERO_ID,
} from '@queues/background/enqueues/moderation-summary-state'
import type { ModerationSummaryStageArgs } from '@services/communities/moderation-summary-pages'
import { captureModerationDigestPages } from './moderation-digest-page-capture.mts'
import {
  moderationDigestPlanFixture,
  moderationDigestWindow,
} from '../seed-data/moderation-digest-pages.mts'

type Fixture = ReturnType<typeof moderationDigestPlanFixture>

export async function runModerationDigestPageScenarios(): Promise<void> {
  const fixture = moderationDigestPlanFixture()
  try {
    await fixture.seed()
    await write(
      '/* analyzeModerationDigestPageFixture */ ANALYZE community_members, community_applications, community_post_reviews, posts, moderation_reports, users',
    )
    await captureMemberships(fixture)
    await captureRankSources(fixture)
    await captureActivitySources(fixture)
  } finally {
    await fixture.cleanup()
  }
}

function args(fixture: Fixture): ModerationSummaryStageArgs {
  const window = moderationDigestWindow()
  return {
    ...window,
    userId: fixture.moderator,
    collection: {
      ...createModerationSummaryCollection(),
      scan: createModerationSummaryScan(fixture.communityId),
      activityWindowEnd: window.windowEnd.toISOString(),
    },
    communities: [],
  }
}

async function captureMemberships(fixture: Fixture) {
  const initial = args(fixture)
  await captureModerationDigestPages(
    'memberships',
    { ...initial, collection: { ...initial.collection, scan: null } },
    ['moderationSummaryMembershipUpper', 'collectModerationSummaryMembershipPage'],
    (first, last) => {
      assert.equal(first.collection.afterMembershipId, fixture.moderatorMemberships[9])
      assert.equal(first.collection.upperMembershipId, fixture.moderatorMemberships[10])
      assert.equal(first.collection.scan, null)
      assert.equal(last.collection.afterMembershipId, fixture.moderatorMemberships[10])
      assert.equal(last.next, 'reviews')
      assert.deepEqual(last.collection.scan, createModerationSummaryScan(fixture.communityId))
    },
  )
}

async function captureRankSources(fixture: Fixture) {
  await captureModerationDigestPages(
    'reviews',
    args(fixture),
    ['moderationSummaryReviewUpper', 'collectModerationSummaryReviewPage'],
    (first, last) => {
      const scan = first.collection.scan!
      assert.equal(scan.afterId, fixture.targetRoots[24])
      assert.equal(scan.sourceUpperId, fixture.parentId)
      assert.equal(scan.metrics.pending_post_reviews, 24)
      assert.equal(scan.metrics.escalated_items, 1)
      assert.equal(last.next, 'applications')
      assert.equal(last.collection.scan!.afterId, MODERATION_SUMMARY_ZERO_ID)
      assert.equal(last.collection.scan!.metrics.pending_post_reviews, 25)
    },
  )
  await captureModerationDigestPages(
    'applications',
    args(fixture),
    ['moderationSummaryApplicationUpper', 'collectModerationSummaryApplicationPage'],
    (first, last) => {
      assert.equal(first.collection.scan!.afterId, fixture.targetApplications[24])
      assert.equal(first.collection.scan!.sourceUpperId, fixture.targetApplications[25])
      assert.equal(first.collection.scan!.metrics.pending_applications, 24)
      assert.equal(last.next, 'reportPosts')
      assert.equal(last.collection.scan!.afterId, MODERATION_SUMMARY_ZERO_ID)
      assert.equal(last.collection.scan!.metrics.pending_applications, 25)
    },
  )
  await captureModerationDigestPages(
    'reportPosts',
    args(fixture),
    ['moderationSummaryReportPostUpper', 'collectModerationSummaryReportPostPage'],
    (first, last) => {
      assert.equal(first.collection.scan!.afterId, fixture.targetRoots[24])
      assert.equal(first.collection.scan!.sourceUpperId, fixture.replies[25])
      assert.equal(first.collection.scan!.parentId, null)
      assert.equal(last.next, 'reports')
      assert.equal(last.collection.scan!.parentId, fixture.parentId)
      assert.equal(last.collection.scan!.afterId, fixture.parentId)
    },
  )
  const initial = args(fixture)
  initial.collection.scan!.parentId = fixture.parentId
  await captureModerationDigestPages(
    'reports',
    initial,
    ['moderationSummaryReportUpper', 'collectModerationSummaryReportPage'],
    (first, last) => {
      assert.equal(first.collection.scan!.afterChildId, fixture.targetReports[24])
      assert.equal(first.collection.scan!.childUpperId, fixture.targetReports[25])
      assert.equal(first.collection.scan!.metrics.pending_reports, 25)
      assert.equal(first.collection.scan!.metrics.escalated_items, 1)
      assert.equal(last.next, 'reportPosts')
      assert.equal(last.collection.scan!.parentId, null)
      assert.equal(last.collection.scan!.metrics.pending_reports, 26)
      assert.equal(last.collection.scan!.metrics.escalated_items, 1)
    },
  )
}

async function captureActivitySources(fixture: Fixture) {
  await captureModerationDigestPages(
    'members',
    args(fixture),
    ['moderationSummaryCommunityMemberUpper', 'collectModerationSummaryMemberPage'],
    (first, last) => {
      const scan = first.collection.scan!
      assert.equal(scan.afterId, fixture.targetMemberships[24])
      assert.equal(scan.sourceUpperId, fixture.targetMemberships[25])
      assert.equal(scan.metrics.new_members, 25)
      assert.equal(scan.metrics.departed_members, 1)
      assert.equal(scan.metrics.total_active_members, 24)
      assert.equal(scan.metrics.active_member_count, 1)
      assert.equal(last.next, 'activityPosts')
      assert.equal(last.collection.scan!.metrics.new_members, 26)
      assert.equal(last.collection.scan!.metrics.total_active_members, 25)
    },
  )
  await captureModerationDigestPages(
    'activityPosts',
    args(fixture),
    ['collectModerationSummaryActivityPostPage'],
    (first, last) => {
      assert.equal(first.collection.scan!.afterId, fixture.targetRoots[24])
      assert.equal(first.collection.scan!.metrics.new_discussion_posts, 24)
      assert.deepEqual(first.collection.scan!.bestDiscussion, {
        id: fixture.targetRoots[1],
        replies: 0,
      })
      assert.equal(last.next, 'replies')
      assert.equal(last.collection.scan!.parentId, fixture.parentId)
      assert.equal(last.collection.scan!.metrics.new_discussion_posts, 25)
    },
  )
  const initial = args(fixture)
  initial.collection.scan!.parentId = fixture.parentId
  await captureModerationDigestPages(
    'replies',
    initial,
    ['collectModerationSummaryReplyPage'],
    (first, last) => {
      assert.equal(first.collection.scan!.afterChildId, fixture.replies[24])
      assert.equal(first.collection.scan!.childCount, 24)
      assert.equal(last.next, 'activityPosts')
      assert.equal(last.collection.scan!.parentId, null)
      assert.equal(last.collection.scan!.afterChildId, fixture.replies[25])
      assert.deepEqual(last.collection.scan!.bestDiscussion, { id: fixture.parentId, replies: 25 })
    },
  )
}
