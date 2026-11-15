import { parseEmailDigestJob } from '../queues/email-digests/payload/job-payload.mts'

export const moderationSummaryIds = {
  user: '01900000-0000-7000-8000-000000000001',
  event: '01900000-0000-7000-8000-000000000002',
  community: '01900000-0000-7000-8000-000000000003',
  membership: '01900000-0000-7000-8000-000000000004',
  parent: '01900000-0000-7000-8000-000000000005',
  child: '01900000-0000-7000-8000-000000000006',
  sourceUpper: '01900000-0000-7000-8000-000000000007',
  childUpper: '01900000-0000-7000-8000-000000000008',
}

export const moderationSummaryMetrics = {
  pending_post_reviews: 2,
  pending_applications: 1,
  pending_reports: 0,
  escalated_items: 0,
  suspected_ban_evaders: 0,
  new_members: 3,
  departed_members: 1,
  total_active_members: 12,
  active_member_count: 5,
  new_discussion_posts: 4,
  new_review_posts: 1,
  new_data_point_posts: 0,
}

export const moderationSummaryCollectionFixture = {
  eventId: moderationSummaryIds.event,
  phase: 'community',
  afterMembershipId: moderationSummaryIds.membership,
  upperMembershipId: moderationSummaryIds.membership,
  activityWindowEnd: '2026-11-15T20:00:00.000Z',
  eligibleCount: 1,
  top: [
    {
      communityId: moderationSummaryIds.community,
      pendingScore: 3,
      discussionPostId: moderationSummaryIds.parent,
      metrics: moderationSummaryMetrics,
    },
  ],
  discussionCommunityIndex: 0,
  scan: {
    communityId: moderationSummaryIds.community,
    stage: 'replies',
    afterId: moderationSummaryIds.parent,
    parentId: moderationSummaryIds.parent,
    afterChildId: moderationSummaryIds.child,
    sourceUpperId: moderationSummaryIds.sourceUpper,
    childUpperId: moderationSummaryIds.childUpper,
    childCount: 1,
    metrics: moderationSummaryMetrics,
    bestDiscussion: { id: moderationSummaryIds.parent, replies: 4 },
  },
}

export const moderationSummaryCommunityFixture = {
  communityId: moderationSummaryIds.community,
  name: 'Travel Deals',
  url: 'https://voucha.ai/communities/travel-deals',
  newMembers: 3,
  departedMembers: 1,
  netMemberChange: 2,
  totalActiveMembers: 12,
  newDiscussionPosts: 4,
  newReviewPosts: 1,
  newDataPointPosts: 0,
  topDiscussionTitle: 'Plan a trip',
  topDiscussionReplyCount: 4,
  pendingPostReviews: 2,
  pendingApplications: 1,
  pendingReports: 0,
  escalatedItems: 0,
  suspectedBanEvaders: 0,
  activeMemberCount: 5,
  activeMemberRate: 0.4,
}

export function createModerationSummaryJobPayload({
  collection = moderationSummaryCollectionFixture,
  communities = [moderationSummaryCommunityFixture],
  remainingCommunityCount = 0,
}: {
  collection?: unknown
  communities?: unknown
  remainingCommunityCount?: unknown
} = {}) {
  return {
    input: {
      userId: moderationSummaryIds.user,
      trackingKey: 'moderation-summary-test-key',
      windowStart: '2026-11-08T20:00:00.000Z',
      windowEnd: '2026-11-15T20:00:00.000Z',
    },
    variables: {
      generatedForDate: '2026-11-15',
      dispatchTimeZone: 'America/Los_Angeles',
      settingsUrl: 'https://voucha.ai/my/notification-settings',
      unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
      physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
      communities,
      remainingCommunityCount,
      collection,
    },
  }
}

export function parseModerationSummaryJob(payload: unknown) {
  return parseEmailDigestJob('processSendCommunityModerationSummaryEmail', payload)
}

export function roundTripModerationSummaryJob(payload: unknown) {
  return parseModerationSummaryJob(JSON.parse(JSON.stringify(payload)) as unknown)
}
